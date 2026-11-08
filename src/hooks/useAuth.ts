import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      // Check if a session already exists
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUserId(session.user.id);
        setLoading(false);
      } else {
        // Create a new anonymous session
        const { data, error } = await supabase.auth.signInAnonymously();
        if (data?.user) {
          setUserId(data.user.id);
        } else {
          console.error("Auth error:", error);
        }
        setLoading(false); // <--- Only stop loading AFTER we get the ID
      }
    }
    
    initAuth();

    // Listen for changes in the background
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return { userId, loading };
}