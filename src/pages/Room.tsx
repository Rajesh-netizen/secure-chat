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
  const [connectionStatus, setConnectionStatus] = useState<"CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED">("CONNECTING");
  
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [myNickname] = useState(() => `anon_${Math.floor(1000 + Math.random() * 9000)}`);

  const [destructTime, setDestructTime] = useState<number>(0);
  
  const channelRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // --- Security: Block Right Click, Copy, Cut, and Screenshot Shortcuts ---
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleCopy = (e: ClipboardEvent) => { e.preventDefault(); alert("Copying is disabled for security reasons."); };
    const handleCut = (e: ClipboardEvent) => { e.preventDefault(); alert("Cutting is disabled for security reasons."); };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl+C, Ctrl+S, Ctrl+P, PrintScreen, Ctrl+Shift+S, etc.
      if (
        (e.ctrlKey && ['c', 'x', 's', 'p', 'u'].includes(e.key.toLowerCase())) || 
        e.key === "PrintScreen" || 
        e.metaKey // Blocks CMD+C on Mac
      ) {
        e.preventDefault();
        alert("Action disabled for security.");
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function initRoom() {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, salt, created_by")
        .eq("code", roomCode)
        .single();

      if (error || !data) {
        alert("ROOM NOT FOUND OR CLOSED");
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

  useEffect(() => {
    if (!roomId || !cryptoKey) return;

    const channelName = `room_${roomId}`;
    supabase.removeChannel(supabase.channel(channelName));

    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId || "anon" } }
    });

    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const decryptedText = await decryptMessage(payload.new.ciphertext, payload.new.iv, cryptoKey);
          setMessages((prev) => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, { ...payload.new, text: decryptedText }];
          });
          setTimeout(() => {
            if (scrollContainerRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
              if (scrollHeight - scrollTop - clientHeight < 150) scrollToBottom();
            }
          }, 100);
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
        { event: "DELETE", schema: "public", table: "rooms" },
        (payload) => {
          if (payload.old.id === roomId) {
            alert("ROOM CLOSED BY OWNER");
            onLeave();
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineUsers(Object.keys(state).length);
      })
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnectionStatus("CONNECTED");
          await channel.track({ nickname: myNickname, online_at: new Date().toISOString() });
        } else if (status === "CHANNEL_ERROR") {
          setConnectionStatus("RECONNECTING");
        } else if (status === "CLOSED") {
          setConnectionStatus("DISCONNECTED");
        }
      });

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomId, cryptoKey, userId, onLeave, myNickname]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      setMessages((prev) => 
        prev.filter((msg) => !msg.expires_at || new Date(msg.expires_at).getTime() > now)
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
        payload: { userId, nickname: myNickname }
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
        nickname: myNickname,
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
      const confirmDestroy = window.confirm("You are the HOST. This will permanently DELETE the room for everyone. Continue?");
      if (confirmDestroy) {
        try {
          const { error } = await supabase.rpc('close_room', { room_uuid: roomId });
          if (error) throw error;
        } catch (error: any) {
          alert("Failed to close room: " + error.message);
          return;
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
        <div className="header-info">
          <span className={`status-dot ${connectionStatus === "CONNECTED" ? "" : "bg-red"}`}></span>
          <span className="hide-on-mobile" style={{ color: connectionStatus === "CONNECTED" ? "var(--text-dim)" : "#ff3333" }}>
            {connectionStatus}:
          </span>
          <span style={{ fontWeight: "bold" }}>{myNickname}</span>
          {isCreator && <span className="host-badge">HOST</span>}
          <span className="online-count">{onlineUsers} ONLINE</span>
        </div>
        
        <div className="header-controls">
          <select className="destruct-select" value={destructTime} onChange={(e) => setDestructTime(Number(e.target.value))}>
            <option value={0}>Burn: OFF</option>
            <option value={10000}>10s</option>
            <option value={60000}>1m</option>
            <option value={3600000}>1h</option>
          </select>

          <button onClick={handleDisconnect} className="leave-btn">
            {isCreator ? "[ CLOSE ROOM ]" : "[ LEAVE ]"}
          </button>
        </div>
      </div>

      <div className="chat-messages" ref={scrollContainerRef} onScroll={handleScroll}>
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
            const isConsecutive = prevMsg && 
              prevMsg.sender_id === msg.sender_id && 
              (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 120000;

            return (
              <div key={msg.id} className={`message ${isMe ? "my-message" : ""} ${isConsecutive ? "consecutive" : ""}`}>
                {!isConsecutive && (
                  <div className="msg-meta">
                    <span className="msg-author">{isMe ? "YOU" : msg.nickname}</span>
                    <span className="msg-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.expires_at && <span className="burn-tag">[BURNING]</span>}
                  </div>
                )}
                
                {/* Removed onClick copy and hover effects to prevent selection */}
                <div className="msg-text">
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          <span className="typing-dots">...</span> {typingUsers.join(", ")} is typing
        </div>
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
          {isSending ? "..." : "SEND"}
        </button>
      </form>
    </div>
  );
}