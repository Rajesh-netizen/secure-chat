import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

// Custom memory storage to bypass browser Local Storage bugs
const memoryStorage = {
  getItem: (key: string) => {
    return (window as any)[key] || null;
  },
  setItem: (key: string, value: string) => {
    (window as any)[key] = value;
  },
  removeItem: (key: string) => {
    delete (window as any)[key];
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: memoryStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
});