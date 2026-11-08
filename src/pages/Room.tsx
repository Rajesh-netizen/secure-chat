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
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [isSending, setIsSending] = useState(false);
  
  // Self-destruct timer state (0 = off)
  const [destructTime, setDestructTime] = useState<number>(0);
  
  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // 1. Init Room & Crypto
  useEffect(() => {
    async function initRoom() {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, salt")
        .eq("code", roomCode)
        .single();

      if (error || !data) {
        alert("Room not found!");
        onLeave();
        return;
      }
      setRoomId(data.id);
      const key = await deriveKey(password, data.salt);
      setCryptoKey(key);
    }
    initRoom();
  }, [roomCode, password, onLeave]);

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

  // 3. Realtime & Typing Listener
  useEffect(() => {
    if (!roomId || !cryptoKey) return;

    const channel = supabase
      .channel(`room_${roomId}`)
      // Listen for new messages
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
      // Listen for deleted messages (burn or self-destruct)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      // Listen for typing indicators
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload.userId !== userId) {
          setTypingUsers((prev) => {
            if (!prev.includes(payload.payload.nickname)) {
              return [...prev, payload.payload.nickname];
            }
            return prev;
          });
          
          // Remove typing indicator after 2 seconds
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter(u => u !== payload.payload.nickname));
          }, 2000);
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [roomId, cryptoKey, userId]);

  // 4. Client-side Self-Destruct Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      setMessages((prev) => 
        prev.filter((msg) => {
          if (msg.expires_at) {
            return new Date(msg.expires_at).getTime() > now;
          }
          return true;
        })
      );
    }, 1000); // Check every second
    return () => clearInterval(interval);
  }, []);

  // Scroll Logic
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

  // Typing broadcast
  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    if (channelRef.current && userId) {
      channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, nickname: "anon" }
      });
    }
  };

  // 5. Send Message & Handle Commands
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !roomId || !cryptoKey || isSending) return;

    // Handle /burn command
    if (newMessage.trim() === "/burn") {
      if (window.confirm("Are you sure you want to burn this room? All messages will be permanently deleted.")) {
        await supabase.from("messages").delete().eq("room_id", roomId);
        setMessages([]);
      }
      setNewMessage("");
      return;
    }

    setIsSending(true);
    const textToSend = newMessage;
    setNewMessage("");

    try {
      const { ciphertext, iv } = await encryptMessage(textToSend, cryptoKey);
      
      // Calculate expiry time
      let expires_at = null;
      if (destructTime > 0) {
        expires_at = new Date(Date.now() + destructTime).toISOString();
      }

      const { error } = await supabase.from("messages").insert({
        room_id: roomId,
        sender_id: userId,
        nickname: "anon",
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

  const handleDisconnect = () => {
    if (window.confirm("Disconnect from room?")) onLeave();
  };

  if (!roomId || !cryptoKey) return <div className="system-msg" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Establishing secure connection...</div>;

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-dot"></span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>CONNECTED TO:</span>
          <span style={{ fontWeight: "bold", letterSpacing: "1px" }}>{roomCode}</span>
        </div>
        
        {/* Self Destruct Selector */}
        <select 
          className="destruct-select" 
          value={destructTime} 
          onChange={(e) => setDestructTime(Number(e.target.value))}
        >
          <option value={0}>Self-Destruct: OFF</option>
          <option value={10000}>10 Seconds</option>
          <option value={60000}>1 Minute</option>
          <option value={3600000}>1 Hour</option>
        </select>

        <button onClick={handleDisconnect} className="leave-btn">[ DISCONNECT ]</button>
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
        <div className="typing-indicator">
          {typingUsers.join(", ")} is typing...
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
          placeholder="Type a message... (or /burn to delete room)"
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