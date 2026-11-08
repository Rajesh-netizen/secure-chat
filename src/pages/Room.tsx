import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { deriveKey, encryptMessage, decryptMessage } from "../lib/crypto";

export function Room({ 
  roomCode, 
  password, 
  userId, 
  onLeave 
}: { 
  roomCode: string; 
  password: string; 
  userId: string | null; 
  onLeave: () => void;
}) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  // Generate a random 4-digit nickname for this session
  const [myNickname] = useState(() => `anon_${Math.floor(1000 + Math.random() * 9000)}`);

  const [destructTime, setDestructTime] = useState<number>(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // 1. Init Room, Check Creator, Generate Key
  useEffect(() => {
    async function initRoom() {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, salt, created_by")
        .eq("code", roomCode)
        .single();

      if (error || !data) {
        alert("Room not found or has been closed!");
        onLeave();
        return;
      }
      
      setRoomId(data.id);
      setIsCreator(data.created_by === userId);
      
      const key = await deriveKey(password, data.salt);
      setCryptoKey(key);
    }
    if (userId) initRoom();
  }, [roomCode, password, userId, onLeave]);

  // 2. Fetch Messages
  useEffect(() => {
    if (!roomId || !cryptoKey) return;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });

      if (error) console.error(error);
      
      if (data) {
        const decryptedMessages = await Promise.all(
          data.map(async (msg) => ({
            ...msg,
            text: await decryptMessage(msg.ciphertext, msg.iv, cryptoKey!)
          }))
        );
        setMessages(decryptedMessages);
      }
      setLoading(false);
    }
    fetchMessages();
  }, [roomId, cryptoKey]);

  // 3. Realtime Listeners
  useEffect(() => {
    if (!roomId || !cryptoKey) return;

    const channel = supabase
      .channel(`room_${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const decryptedText = await decryptMessage(payload.new.ciphertext, payload.new.iv, cryptoKey);
          setMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, { ...payload.new, text: decryptedText }];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => {
          alert("The room creator has closed this room.");
          onLeave();
        }
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.userId !== userId) {
          setTypingUsers((prev) => {
            if (!prev.includes(payload.payload.nickname)) return [...prev, payload.payload.nickname];
            return prev;
          });
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter(u => u !== payload.payload.nickname));
          }, 2000);
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomId, cryptoKey, userId, onLeave]);

  // Client-side Self-Destruct Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      setMessages((prev) => 
        prev.filter((msg) => {
          if (msg.expires_at) return new Date(msg.expires_at).getTime() > now;
          return true;
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
    if (atBottom) setShowJumpButton(false);
  };

  useEffect(() => {
    if (messages.length > 0) {
      if (isAtBottom) scrollToBottom();
      else setShowJumpButton(true);
    }
  }, [messages, isAtBottom]);

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (channelRef.current && userId) {
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, nickname: myNickname } // Send our random nickname
      });
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !roomId || !cryptoKey || isSending) return;

    if (newMessage.trim() === "/burn") {
      if (isCreator) {
        if (window.confirm("Are you sure you want to burn this room? All messages will be permanently deleted.")) {
          await supabase.from("messages").delete().eq("room_id", roomId);
          setMessages([]);
        }
      } else {
        alert("Only the room creator can burn the room.");
      }
      setNewMessage("");
      return;
    }

    setIsSending(true);
    const textToSend = newMessage;
    setNewMessage("");

    try {
      const { ciphertext, iv } = await encryptMessage(textToSend, cryptoKey);
      let expires_at = null;
      if (destructTime > 0) expires_at = new Date(Date.now() + destructTime).toISOString();

      const { error } = await supabase.from("messages").insert({
        room_id: roomId,
        sender_id: userId,
        nickname: myNickname, // Save our random nickname to the DB
        iv: iv,                 
        ciphertext: ciphertext, 
        expires_at: expires_at
      });

      if (error) throw error;
      setIsAtBottom(true);
      setTimeout(() => scrollToBottom(), 100);
    } catch (error: any) {
      alert(`Failed to send: ${error.message}`);
      setNewMessage(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as React.FormEvent);
    }
  };

  const handleDisconnect = async () => {
    if (isCreator) {
      const confirmDestroy = window.confirm("You are the creator. Disconnecting will permanently close this room for everyone and delete all messages. Continue?");
      if (confirmDestroy) {
        try {
          await supabase.from("rooms").delete().eq("id", roomId);
        } catch (error) {
          console.error("Error deleting room:", error);
        }
        if (channelRef.current) supabase.removeChannel(channelRef.current);
        onLeave();
      }
    } else {
      const confirmLeave = window.confirm("Are you sure you want to leave this room?");
      if (confirmLeave) onLeave();
    }
  };

  if (!roomId || !cryptoKey) return <div className="system-msg" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Establishing secure connection...</div>;

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-dot"></span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>CONNECTED:</span>
          <span style={{ fontWeight: "bold", letterSpacing: "1px" }}>{myNickname}</span>
          {isCreator && <span style={{ fontSize: "0.7rem", color: "var(--bg)", background: "var(--text)", padding: "2px 6px", borderRadius: "4px", marginLeft: "8px" }}>HOST</span>}
        </div>
        
        <select className="destruct-select" value={destructTime} onChange={(e) => setDestructTime(Number(e.target.value))}>
          <option value={0}>Self-Destruct: OFF</option>
          <option value={10000}>10 Seconds</option>
          <option value={60000}>1 Minute</option>
          <option value={3600000}>1 Hour</option>
        </select>

        <button onClick={handleDisconnect} className="leave-btn">
          {isCreator ? "[ CLOSE ROOM ]" : "[ DISCONNECT ]"}
        </button>
      </div>

      <div className="chat-messages" ref={scrollContainerRef} onScroll={handleScroll}>
        {loading ? (
          <div className="system-msg">Decrypting secure logs...</div>
        ) : messages.length === 0 ? (
          <div className="system-msg">Connection established. No messages yet.</div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === userId;
            return (
              <div key={msg.id} className={`message ${isMe ? "my-message" : ""}`}>
                <div className="msg-meta">
                  [{new Date(msg.created_at).toLocaleTimeString()}] {isMe ? "YOU" : msg.nickname}:
                  {msg.expires_at && <span style={{ color: "#ff3333", marginLeft: "8px" }}>[BURNING]</span>}
                </div>
                <div className="msg-text">{msg.text}</div>
              </div>
            );
          })
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="typing-indicator">{typingUsers.join(", ")} is typing...</div>
      )}

      {showJumpButton && (
        <button className="jump-btn" onClick={() => { setIsAtBottom(true); scrollToBottom(); }}>
          ↓ NEW MESSAGES
        </button>
      )}

      <form onSubmit={sendMessage} className="chat-input-form">
        <span className="prompt-symbol">&gt;</span>
        <textarea
          value={newMessage}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          placeholder={`Message as ${myNickname}...`}
          className="chat-input"
          rows={1}
          autoFocus
          disabled={isSending}
        />
        <button type="submit" className="send-btn" disabled={isSending || !newMessage.trim()}>
          SEND
        </button>
      </form>
    </div>
  );
}