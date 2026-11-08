import { useState, useEffect } from "react";
import { Landing } from "./pages/Landing";
import { Room } from "./pages/Room";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState("");
  const { userId, loading } = useAuth();

  useEffect(() => {
    const savedRoom = sessionStorage.getItem("activeRoom");
    const savedPassword = sessionStorage.getItem("roomPassword");
    
    if (savedRoom && savedPassword) {
      setActiveRoom(savedRoom);
      setRoomPassword(savedPassword);
    }
  }, []);

  const handleJoin = (code: string, pass: string) => {
    setActiveRoom(code);
    setRoomPassword(pass);
    sessionStorage.setItem("activeRoom", code);
    sessionStorage.setItem("roomPassword", pass);
  };

  const handleLeave = () => {
    setActiveRoom(null);
    setRoomPassword("");
    sessionStorage.removeItem("activeRoom");
    sessionStorage.removeItem("roomPassword");
  };

  if (loading) {
    return <div style={{ color: "#00ff41", fontFamily: "monospace", display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>Initializing secure connection...</div>;
  }

  return (
    <div className="app-container">
      {activeRoom ? (
        <Room roomCode={activeRoom} password={roomPassword} userId={userId} onLeave={handleLeave} />
      ) : (
        // Pass userId to Landing here!
        <Landing onJoin={handleJoin} userId={userId} />
      )}
    </div>
  );
}