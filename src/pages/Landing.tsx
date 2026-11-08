import { useState } from "react";
import { supabase } from "../lib/supabase";
import { deriveKey } from "../lib/crypto";

export function Landing({ 
  onJoin 
}: { 
  onJoin: (name: string, key: CryptoKey) => void; 
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
    if (!createName || !createPassword) return setCreateError("All fields required.");

    setCreating(true);

    try {
      await supabase.auth.signOut(); 
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;

      const msgBuffer = new TextEncoder().encode(createPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const { data: roomId, error } = await supabase.rpc('create_room', {
        room_name: createName.toLowerCase(),
        pass_hash: hashHex
      });

      if (error) throw error;

      const key = await deriveKey(createPassword, roomId);
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
    if (!joinName || !joinPassword) return setJoinError("All fields required.");

    setJoining(true);

    try {
      await supabase.auth.signOut(); 
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;

      const msgBuffer = new TextEncoder().encode(joinPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const { data: roomId, error } = await supabase.rpc('join_room', {
        room_name: joinName.toLowerCase(),
        pass_hash: hashHex
      });

      if (error) throw error;

      const key = await deriveKey(joinPassword, roomId);
      onJoin(joinName.toLowerCase(), key);

    } catch (err: any) {
      setJoinError(err.message || "Invalid room name or password.");
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
        <div className="action-panel glass-panel">
          <h2 className="panel-title">Create Room</h2>
          <form onSubmit={handleCreateRoom} className="panel-form">
            <div className="input-group">
              <label>Room Name</label>
              <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} className="terminal-input" placeholder="e.g. alpha-room" />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} className="terminal-input" placeholder="Min 6 chars" />
            </div>
            {createError && <div className="error-msg">{createError}</div>}
            <button type="submit" className="btn glass-panel-accent" disabled={creating}>
              {creating ? "Connecting..." : "Initialize Room"}
            </button>
          </form>
        </div>

        <div className="action-panel glass-panel">
          <h2 className="panel-title">Join Room</h2>
          <form onSubmit={handleJoinRoom} className="panel-form">
            <div className="input-group">
              <label>Room Name</label>
              <input type="text" value={joinName} onChange={(e) => setJoinName(e.target.value)} className="terminal-input" placeholder="Enter room name" />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} className="terminal-input" placeholder="Enter password" />
            </div>
            {joinError && <div className="error-msg">{joinError}</div>}
            <button type="submit" className="btn glass-panel-accent" disabled={joining}>
              {joining ? "Connecting..." : "Connect to Room"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}