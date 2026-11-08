import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Landing({ onJoin }: { onJoin: (code: string, password: string) => void }) {
  // Independent states for Create Section
  const [createCode, setCreateCode] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Independent states for Join Section
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

    setCreating(true);

    // Check if room code already exists
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

    // Insert new room
    const { error: createError } = await supabase
      .from("rooms")
      .insert([{ code: createCode.toUpperCase(), salt: crypto.randomUUID() }]);

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

    // Check if room exists
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

    // Note: True password verification happens inside the Room component
    // when it tries to decrypt messages.
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
        {/* SECTION A: CREATE ROOM */}
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
                <button 
                  type="button" 
                  className="toggle-pw"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                >
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

        {/* SECTION B: JOIN ROOM */}
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
                <button 
                  type="button" 
                  className="toggle-pw"
                  onClick={() => setShowJoinPassword(!showJoinPassword)}
                >
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