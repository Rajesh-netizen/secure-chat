import { useState } from "react";
import { supabase } from "../lib/supabase";

// Add userId to props
export function Landing({ onJoin, userId }: { onJoin: (code: string, password: string) => void; userId: string | null }) {
  const [createCode, setCreateCode] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [showJoinPassword, setShowJoinPassword] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    
    if (!createCode.trim() || !createPassword.trim()) {
      return setCreateError("Both Room Code and Password are required.");
    }
    if (createCode.length < 4) {
      return setCreateError("Room Code must be at least 4 characters.");
    }
    if (!userId) {
      return setCreateError("Still connecting to secure network. Try again in a second.");
    }

    setCreating(true);

    const { data: existingRoom } = await supabase
      .from("rooms")
      .select("id")
      .eq("code", createCode.toUpperCase())
      .single();

    if (existingRoom) {
      setCreateError("This Room Code is already in use. Try another.");
      setCreating(false);
      return;
    }

    // INSERT WITH created_by ID
    const { error: createError } = await supabase
      .from("rooms")
      .insert([{ 
        code: createCode.toUpperCase(), 
        salt: crypto.randomUUID(),
        created_by: userId // <--- This makes them the HOST
      }]);

    if (createError) {
      setCreateError(createError.message);
      setCreating(false);
      return;
    }

    onJoin(createCode.toUpperCase(), createPassword);
    setCreating(false);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError("");

    if (!joinCode.trim() || !joinPassword.trim()) {
      return setJoinError("Both Room Code and Password are required.");
    }

    setJoining(true);

    const { data, error: findError } = await supabase
      .from("rooms")
      .select("code")
      .eq("code", joinCode.toUpperCase())
      .single();

    if (findError || !data) {
      setJoinError("Room not found. Check the code.");
      setJoining(false);
      return;
    }

    onJoin(data.code, joinPassword);
    setJoining(false);
  };

  return (
    <div className="landing-wrapper">
      <div className="landing-header">
        <h1 className="title">SECURE_CHAT</h1>
        <p className="subtitle">Encrypted. Ephemeral. Anonymous.</p>
      </div>

      <div className="landing-grid">
        {/* CREATE SECTION */}
        <div className="action-panel">
          <h2 className="panel-title">Create New Room</h2>
          <form onSubmit={handleCreateRoom} className="panel-form">
            <div className="input-group">
              <label>Room Code</label>
              <input
                type="text"
                placeholder="e.g. ALPHA-01"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                maxLength={12}
                className="terminal-input"
              />
            </div>
            <div className="input-group">
              <label>Encryption Password</label>
              <div className="password-wrapper">
                <input
                  type={showCreatePassword ? "text" : "password"}
                  placeholder="Enter secure password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="terminal-input"
                />
                <button type="button" className="toggle-pw" onClick={() => setShowCreatePassword(!showCreatePassword)}>
                  {showCreatePassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>
            {createError && <div className="error-msg">{createError}</div>}
            <button type="submit" className="btn primary" disabled={creating}>
              {creating ? "Initializing..." : "Create & Enter Room"}
            </button>
          </form>
        </div>

        {/* JOIN SECTION */}
        <div className="action-panel">
          <h2 className="panel-title">Join Existing Room</h2>
          <form onSubmit={handleJoinRoom} className="panel-form">
            <div className="input-group">
              <label>Room Code</label>
              <input
                type="text"
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={12}
                className="terminal-input"
              />
            </div>
            <div className="input-group">
              <label>Encryption Password</label>
              <div className="password-wrapper">
                <input
                  type={showJoinPassword ? "text" : "password"}
                  placeholder="Enter secure password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  className="terminal-input"
                />
                <button type="button" className="toggle-pw" onClick={() => setShowJoinPassword(!showJoinPassword)}>
                  {showJoinPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>
            {joinError && <div className="error-msg">{joinError}</div>}
            <button type="submit" className="btn secondary" disabled={joining}>
              {joining ? "Connecting..." : "Join Room"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}