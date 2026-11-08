import { useState } from "react";
import { supabase } from "../lib/supabase";
import { generateVerifier, deriveKey } from "../lib/crypto";
import { solveProofOfWork } from "../lib/pow";

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

  const [honeypot, setHoneypot] = useState("");

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");

    if (honeypot) return setCreateError("Bot detected.");
    if (!createName.match(/^[a-zA-Z0-9_-]{3,30}$/)) {
      return setCreateError("Name must be 3-30 chars: letters, numbers, -, _");
    }
    if (createPassword.length < 6) {
      return setCreateError("Password must be at least 6 characters.");
    }
    if (!userId) {
      return setCreateError("Still authenticating. Please wait a moment.");
    }

    setCreating(true);

    try {
      const proof = await solveProofOfWork();
      const verifier = await generateVerifier(createName.toLowerCase(), createPassword);
      
      const { data: roomId, error } = await supabase.rpc('create_room', {
        room_name: createName.toLowerCase(),
        verifier: verifier,
        client_proof: proof
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

    if (honeypot) return setJoinError("Bot detected.");
    if (!joinName || !joinPassword) return setJoinError("Both fields are required.");
    if (!userId) {
      return setJoinError("Still authenticating. Please wait a moment.");
    }

    setJoining(true);

    try {
      const proof = await solveProofOfWork();
      const verifier = await generateVerifier(joinName.toLowerCase(), joinPassword);
      
      const { data: roomId, error } = await supabase.rpc('join_room', {
        room_name: joinName.toLowerCase(),
        verifier: verifier,
        client_proof: proof
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
        {/* Visual indicator that auth is loading */}
        {!userId && <p style={{ color: "#ff3333", fontSize: "0.8rem", marginTop: "10px" }}>Establishing secure session...</p>}
      </div>

      <div className="landing-grid">
        <input 
          type="text" 
          value={honeypot} 
          onChange={(e) => setHoneypot(e.target.value)} 
          style={{ display: 'none' }} 
          tabIndex={-1} 
          autoComplete="off" 
        />

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
            
            {/* Button is disabled if userId is not loaded */}
            <button type="submit" className="btn" disabled={creating || !userId}>
              {!userId ? "Waiting for Auth..." : creating ? "Computing Proof..." : "Initialize Room"}
            </button>
          </form>
        </div>

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
            
            {/* Button is disabled if userId is not loaded */}
            <button type="submit" className="btn" disabled={joining || !userId}>
              {!userId ? "Waiting for Auth..." : joining ? "Computing Proof..." : "Connect to Room"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}