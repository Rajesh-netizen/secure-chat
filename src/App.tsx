import { useState } from "react";
import { Landing } from "./pages/Landing";
import { Room } from "./pages/Room";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  // We still use useAuth to keep the app in sync, but Landing handles its own login now
  const { userId, loading } = useAuth();

  const handleJoin = (name: string, key: CryptoKey) => {
    setActiveRoom(name);
    setCryptoKey(key);
  };

  const handleLeave = () => {
    setActiveRoom(null);
    setCryptoKey(null);
  };

  if (loading) {
    return <div style={{ color: "#00ff41", fontFamily: "monospace", display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>Initializing secure connection...</div>;
  }

  return (
    <div className="app-container">
      {activeRoom && cryptoKey ? (
        <Room 
          roomName={activeRoom} 
          cryptoKey={cryptoKey} 
          userId={userId} 
          onLeave={handleLeave} 
        />
      ) : (
        <Landing onJoin={handleJoin} />
      )}
    </div>
  );
}