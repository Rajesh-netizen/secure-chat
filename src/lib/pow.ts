// src/lib/pow.ts
export async function solveProofOfWork(): Promise<string> {
  const start = Date.now();
  let nonce = 0;
  const targetDifficulty = 4; // Number of leading zeros required (adjust for ~1 second)
  
  // We use the current timestamp + random string to make it unique
  const base = `${Date.now()}-${Math.random()}`;

  while (true) {
    const msgBuffer = new TextEncoder().encode(`${base}-${nonce}`);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Check if the hash starts with the required number of zeros
    if (hashHex.startsWith("0".repeat(targetDifficulty))) {
      console.log(`PoW solved in ${Date.now() - start}ms`);
      return `${base}-${nonce}`; // Return the proof (base + winning nonce)
    }
    nonce++;
  }
}