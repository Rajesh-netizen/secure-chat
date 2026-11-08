import { useState } from "react";
import { supabase } from "../lib/supabase";
import { generateVerifier, deriveKey } from "../lib/crypto";

export function Landing({ 
  onJoin, 
  userId 
}: { 
  onJoin: (name: string, key: CryptoKey) => void; 
  userId: string | null 
}) {
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinName, setJoinName] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    
    // Validation: 3-30 chars, letters, numbers, hyphen, underscore
    if (!createName.match(/^[a-zA-Z0-9_-]{3,30}$/)) {
      return setCreateError("Name must be 3-30 chars: letters, numbers, -, _");
    }
    if (createPassword.length < 6) {
      return setCreateError("Password must be at least 6 characters.");
    }
    if (!userId) {
      return setCreateError("Still connecting to secure network...");
    }

    setCreating(true);

    try {
      // 1. Generate one-way proof (password is never sent to server)
      const verifier = await generateVerifier(createName.toLowerCase(), createPassword);
      
      // 2. Call secure RPC to create room
      const { data: roomId, error } = await supabase.rpc('create_room', {
        room_name: createName.toLowerCase(),
        verifier: verifier
      });

      if (error) {
        // Postgres Error 23505 = Unique Violation (Room name taken)
        if (error.code === '23505') {
          throw new Error("This room name is already taken. Please try another.");
        }
        throw error;
      }

      // 3. Derive the AES key locally using the new roomId as salt
      const key = await deriveKey(createPassword, roomId);
      
      // 4. Enter the room
      onJoin(createName.toLowerCase(), key);

    } catch (err: any) {
      setCreateError(err.message || "Failed to create room.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError("");

    if (!joinName || !joinPassword) {
      return setJoinError("Both fields are required.");
    }
    if (!userId) {
      return setJoinError("Still connecting to secure network...");
    }

    setJoining(true);

    try {
      // 1. Generate proof
      const verifier = await generateVerifier(joinName.toLowerCase(), joinPassword);
      
      // 2. Verify with server via RPC
      const { data: roomId, error } = await supabase.rpc('join_room', {
        room_name: joinName.toLowerCase(),
        verifier: verifier
      });

      if (error) throw error;

      // 3. Derive local AES key
      const key = await deriveKey(joinPassword, roomId);
      onJoin(joinName.toLowerCase(), key);

    } catch (err: any) {
      // Postgres throws a generic error so attackers can't guess room names
      setJoinError("Invalid room name or password.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="landing-wrapper">
      <div className="landing-header">
        <h1 className="title">SECURE_CHAT</h1>
        <p className="subtitle">Encrypted. Ephemeral. Anonymous.</p>
      </div>

      <div className="landing-grid">
        {/* CREATE PANEL */}
        <div className="action-panel">
          <h2 className="panel-title">Create Room</h2>
          <form onSubmit={handleCreateRoom} className="panel-form">
            <div className="input-group">
              <label>Room Name</label>
              <input
                type="text"
                placeholder="e.g. alpha-room"
                value={createName}
                onChange={(e) => setCreateName(e.target.value.toLowerCase())}
                maxLength={30}
                className="terminal-input"
              />
            </div>
            <div className="input-group">
              <label>Encryption Password</label>
              <input
                type="password"
                placeholder="Min 6 chars"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                className="terminal-input"
              />
            </div>
            {createError && <div className="error-msg">{createError}</div>}
            <button type="submit" className="btn" disabled={creating}>
              {creating ? "Creating..." : "Initialize Room"}
            </button>
          </form>
        </div>

        {/* JOIN PANEL */}
        <div className="action-panel">
          <h2 className="panel-title">Join Room</h2>
          <form onSubmit={handleJoinRoom} className="panel-form">
            <div className="input-group">
              <label>Room Name</label>
              <input
                type="text"
                placeholder="Enter room name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value.toLowerCase())}
                maxLength={30}
                className="terminal-input"
              />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                className="terminal-input"
              />
            </div>
            {joinError && <div className="error-msg">{joinError}</div>}
            <button type="submit" className="btn" disabled={joining}>
              {joining ? "Authenticating..." : "Connect to Room"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}