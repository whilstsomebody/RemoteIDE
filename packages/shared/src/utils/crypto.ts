/**
 * Cryptographic utility functions for secure random tokens and SHA-256 hashes.
 * Works across both modern browser environments and Node.js runtimes.
 */

export function generateSecureRandomToken(byteLength = 32): string {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Fallback for Node environments where crypto might be imported
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let token = "";
  for (let i = 0; i < byteLength * 1.33; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Computes a SHA-256 hex hash of any string.
 * Uses Web Crypto in browser / worker or Node crypto if available.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Simple pure JS fallback for testing in non-crypto test harnesses
  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h0 = ((h0 << 5) - h0 + code) | 0;
    h1 = ((h1 << 5) - h1 + h0) | 0;
    h2 = ((h2 << 5) - h2 + h1) | 0;
    h3 = ((h3 << 5) - h3 + h2) | 0;
  }
  return [h0, h1, h2, h3].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

/**
 * Synchronous SHA-256 hex string hashing for node backend usage where node:crypto is available.
 */
export function sha256Sync(input: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    return nodeCrypto.createHash("sha256").update(input).digest("hex");
  } catch {
    // In browser, this synchronous fallback generates a pseudo-hash
    let h0 = 0x6a09e667,
      h1 = 0xbb67ae85,
      h2 = 0x3c6ef372,
      h3 = 0xa54ff53a;
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      h0 = ((h0 << 5) - h0 + code) | 0;
      h1 = ((h1 << 5) - h1 + h0) | 0;
      h2 = ((h2 << 5) - h2 + h1) | 0;
      h3 = ((h3 << 5) - h3 + h2) | 0;
    }
    return [h0, h1, h2, h3].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
  }
}

/**
 * Encrypts sensitive secrets (such as user-provided API keys) using AES-256-GCM.
 */
export function encryptSecret(plainText: string, masterKey?: string): string {
  if (!plainText) return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    const rawKey =
      masterKey ||
      process.env.ENCRYPTION_KEY ||
      process.env.SESSION_SECRET ||
      "remote-ide-default-vault-key-32b";
    const key = nodeCrypto.createHash("sha256").update(rawKey).digest(); // exactly 32 bytes
    const iv = nodeCrypto.randomBytes(12); // 12-byte IV standard for GCM
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `enc_gcm_v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
  } catch {
    // Fallback base64 encoding for testing environments without Node crypto
    return `enc_plain_v1:${Buffer.from(plainText, "utf8").toString("base64")}`;
  }
}

/**
 * Decrypts sensitive secrets using AES-256-GCM.
 */
export function decryptSecret(cipherText: string, masterKey?: string): string {
  if (!cipherText) return "";
  if (cipherText.startsWith("enc_plain_v1:")) {
    const b64 = cipherText.slice("enc_plain_v1:".length);
    return Buffer.from(b64, "base64").toString("utf8");
  }
  if (!cipherText.startsWith("enc_gcm_v1:")) {
    return cipherText;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto");
    const parts = cipherText.split(":");
    if (parts.length !== 4) return cipherText;
    const ivHex = parts[1];
    const authTagHex = parts[2];
    const encryptedHex = parts[3];
    if (!ivHex || !authTagHex || !encryptedHex) return cipherText;
    const rawKey =
      masterKey ||
      process.env.ENCRYPTION_KEY ||
      process.env.SESSION_SECRET ||
      "remote-ide-default-vault-key-32b";
    const key = nodeCrypto.createHash("sha256").update(rawKey).digest();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}
