import { useEffect, useState } from "react";

export function Intro({ onComplete }: { onComplete: () => void }) {
  const [text, setText] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // 1. Simulate terminal typing
    const fullText = "INITIALIZING SECURE PROTOCOLS...\nLOADING ENCRYPTION KEYS...\nESTABLISHING CONNECTION...\n\nACCESS GRANTED.";
    let currentIndex = 0;

    const typingInterval = setInterval(() => {
      setText((prev) => prev + fullText[currentIndex]);
      currentIndex++;

      if (currentIndex === fullText.length) {
        clearInterval(typingInterval);
        setShowCursor(false);
        
        // 2. Wait 1 second after typing finishes, then fade out
        setTimeout(() => {
          setFadeOut(true);
          // 3. Wait for the fade animation, then unmount
          setTimeout(onComplete, 500); 
        }, 800);
      }
    }, 30); // Speed of typing

    return () => clearInterval(typingInterval);
  }, [onComplete]);

  return (
    <div className={`intro-container ${fadeOut ? "fade-out" : ""}`}>
      {/* Optional: If you have a logo, put it here */}
      <div className="intro-logo">
        <img src="/logo.png" alt="Secure Chat Logo" onError={(e) => (e.currentTarget.style.display = 'none')} />
      </div>
      
      <div className="intro-terminal-text">
        {text}
        {showCursor && <span className="cursor">_</span>}
      </div>
    </div>
  );
}