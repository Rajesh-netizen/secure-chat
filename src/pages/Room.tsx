import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { encryptMessage, decryptMessage } from "../lib/crypto";

export function Room({ 
  roomName, 
  cryptoKey, 
  userId, 
  onLeave 
}: { 
  roomName: string; 
  cryptoKey: CryptoKey; 
  userId: string | null; 
  onLeave: () => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Presence & Typing
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [myNickname] = useState(() => `anon_${Math.floor(1000 + Math.random() * 9000)}`);
  
  const channelRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);


  // Block Copy/Paste
  useEffect(() => {
    const blockAction = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", blockAction);
    document.addEventListener("copy", blockAction);
    document.addEventListener("cut", blockAction);
    return () => {
      document.removeEventListener("contextmenu", blockAction);
      document.removeEventListener("copy", blockAction);
      document.removeEventListener("cut", blockAction);
    };
  }, []);

  // 1. Init Room
  useEffect(() => {
    async function initRoom() {
      if (!roomName) {
        onLeave();
        return;
      }

      const { data, error } = await supabase
        .from("rooms")
        .select("id, created_by")
        .eq("name", roomName)
        .single();

      if (error || !data) {
        alert("ROOM NOT FOUND OR CLOSED");
        onLeave();
        return;
      }
      
      setRoomId(data.id);
      setIsCreator(data.created_by === userId);
    }
    if (userId) initRoom();
  }, [roomName, userId, onLeave]);

  // 2. Fetch & Realtime
  useEffect(() => {
    if (!roomId) return;

    async function fetchMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (data) {
        const decrypted = await Promise.all(
          data.map(async (msg) => ({
            ...msg,
            text: await decryptMessage(msg.ciphertext, msg.iv, cryptoKey)
          }))
        );
        setMessages(decrypted);
      }
      setLoading(false);
    }
    fetchMessages();

    const channel = supabase.channel(`room_${roomId}`, {
      config: { presence: { key: userId || "anon" } }
    });

    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const text = await decryptMessage(payload.new.ciphertext, payload.new.iv, cryptoKey);
          setMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, { ...payload.new, text }];
          });
          setTimeout(() => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: "smooth" }), 100);
        }
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms" },
        (payload) => {
          if (payload.old.id === roomId) {
            alert("ROOM CLOSED BY OWNER");
            onLeave();
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        setOnlineUsers(Object.keys(channel.presenceState()).length);
      })
      // LISTEN FOR TYPING BROADCASTS
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.userId !== userId) {
          const nickname = payload.payload.nickname;
          setTypingUsers((prev) => {
            if (!prev.includes(nickname)) return [...prev, nickname];
            return prev;
          });
          // Remove after 2.5 seconds of inactivity
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter(u => u !== nickname));
          }, 2500);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ nickname: myNickname });
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomId, cryptoKey, userId, onLeave, myNickname]);

  // Handle Typing Broadcast
  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    
    if (channelRef.current && userId) {
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, nickname: myNickname }
      });
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !roomId || isSending) return;
    if (newMessage.length > 2000) return alert("Message too long (max 2000 chars).");

    setIsSending(true);
    const textToSend = newMessage;
    setNewMessage("");

    try {
      const { ciphertext, iv } = await encryptMessage(textToSend, cryptoKey);
      const { error } = await supabase.from("messages").insert({
        room_id: roomId,
        sender_id: userId,
        nickname: myNickname,
        iv: iv,                 
        ciphertext: ciphertext
      });
      if (error) throw error;
    } catch (error: any) {
      alert(`Failed to send: ${error.message}`);
      setNewMessage(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleDisconnect = async () => {
    if (isCreator) {
      if (window.confirm("CLOSE ROOM? This will permanently delete all messages for everyone.")) {
        await supabase.rpc('close_room', { room_uuid: roomId });
        if (channelRef.current) supabase.removeChannel(channelRef.current);
        onLeave();
      }
    } else {
      onLeave();
    }
  };

  if (!roomId) {
    return <div className="system-msg" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Establishing secure connection...</div>;
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-info">
          <span className="status-dot"></span>
          <span>{myNickname}</span>
          {isCreator && <span className="host-badge">HOST</span>}
          <span className="online-count">{onlineUsers} ONLINE</span>
        </div>
        <button onClick={handleDisconnect} className="leave-btn">
          {isCreator ? "[ CLOSE ROOM ]" : "[ LEAVE ]"}
        </button>
      </div>

      <div className="chat-messages" ref={scrollContainerRef}>
        {loading ? (
          <div className="system-msg">Decrypting secure logs...</div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔒</div>
            <div className="empty-text">Secure channel established.</div>
            <div className="empty-subtext">Messages are end-to-end encrypted.</div>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === userId;
            const prevMsg = messages[index - 1];
            const isConsecutive = prevMsg && prevMsg.sender_id === msg.sender_id && 
              (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 120000;

            return (
              <div key={msg.id} className={`message ${isMe ? "my-message" : ""} ${isConsecutive ? "consecutive" : ""}`}>
                {!isConsecutive && (
                  <div className="msg-meta">
                    <span className="msg-author">{isMe ? "YOU" : msg.nickname}</span>
                    <span className="msg-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                <div className="msg-text">{msg.text}</div>
              </div>
            );
          })
        )}
      </div>

      {/* TYPING INDICATOR */}
      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          <span className="typing-dots">...</span> {typingUsers.join(", ")} is typing
        </div>
      )}

      <form onSubmit={sendMessage} className="chat-input-form">
        <span className="prompt-symbol">&gt;</span>
        <textarea
          value={newMessage}
          onChange={handleTyping}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
          placeholder={`Message as ${myNickname}...`}
          className="chat-input"
          rows={1}
          autoFocus
          maxLength={2000}
        />
        <button type="submit" className="send-btn" disabled={isSending || !newMessage.trim()}>SEND</button>
      </form>
    </div>
  );
}