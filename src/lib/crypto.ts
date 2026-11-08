// Convert string to ArrayBuffer
const enc = new TextEncoder();
const dec = new TextDecoder();

// 1. Derive a secure AES-GCM key from a password and a salt (room ID)
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(salt), // The room ID acts as the salt
      iterations: 100000,     // High iteration count for security
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// 2. Encrypt a plaintext message
export async function encryptMessage(text: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Random IV every time
  
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(text)
  );

  return {
    // Convert to base64 so it can be stored in the database as a string
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

// 3. Decrypt a ciphertext message
export async function decryptMessage(ciphertextB64: string, ivB64: string, key: CryptoKey) {
  try {
    const ciphertext = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));

    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );

    return dec.decode(plaintextBuffer);
  } catch (e) {
    return "[Decryption Failed]"; // If the key is wrong or data is corrupted
  }
}

// 4. Generate a one-way HMAC verifier (Proves password without sending it)
export async function generateVerifier(roomName: string, password: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", 
    enc.encode(password), 
    { name: "HMAC", hash: "SHA-256" }, 
    false, 
    ["sign"]
  );
  
  // Sign the room name with the password
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(roomName));
  
  // Return as base64 string
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}