/**
 * Cryptographic utility functions for secure random tokens, SHA-256 hashes and
 * AES-256-GCM secret encryption.
 */
// Static import: this package is ESM, where `require` is undefined. Browser bundles map
// "crypto" to an empty module; the Node-only helpers below are only used server-side.
import nodeCrypto from "crypto";

const GCM_AUTH_TAG_BYTES = 16;
const GCM_IV_BYTES = 12;
const DEV_ONLY_VAULT_KEY = "remote-ide-default-vault-key-32b";

export function generateSecureRandomToken(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength <= 0) {
    throw new RangeError("byteLength must be a positive integer");
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(byteLength);
    globalThis.crypto.getRandomValues(bytes);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  return nodeCrypto.randomBytes(byteLength).toString("base64url");
}

/**
 * Computes a SHA-256 hex hash of any string using Web Crypto, or Node crypto when
 * Web Crypto is unavailable. Never falls back to a non-cryptographic hash.
 */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const data = new TextEncoder().encode(input);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return sha256Sync(input);
}

/**
 * Synchronous SHA-256 hex hash. Requires Node crypto: these hashes protect session,
 * share-link and PIN secrets, so there is deliberately no weak fallback.
 */
export function sha256Sync(input: string): string {
  return nodeCrypto.createHash("sha256").update(input).digest("hex");
}

function resolveVaultKey(masterKey?: string): Buffer {
  const rawKey = masterKey || process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!rawKey && process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY (or SESSION_SECRET) must be set in production");
  }
  return nodeCrypto.createHash("sha256").update(rawKey || DEV_ONLY_VAULT_KEY).digest();
}

/**
 * Encrypts sensitive secrets (such as user-provided API keys) using AES-256-GCM.
 * Throws rather than storing the secret unencrypted when encryption is unavailable.
 */
export function encryptSecret(plainText: string, masterKey?: string): string {
  if (!plainText) return "";
  const key = resolveVaultKey(masterKey);
  const iv = nodeCrypto.randomBytes(GCM_IV_BYTES);
  const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `enc_gcm_v1:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts secrets produced by encryptSecret. Returns "" for malformed or tampered
 * ciphertexts.
 */
export function decryptSecret(cipherText: string, masterKey?: string): string {
  if (!cipherText) return "";
  // Read-only compatibility: earlier builds silently stored secrets as base64 under
  // this prefix. They are decoded so existing data keeps working; nothing writes it now.
  if (cipherText.startsWith("enc_plain_v1:")) {
    return Buffer.from(cipherText.slice("enc_plain_v1:".length), "base64").toString("utf8");
  }
  if (!cipherText.startsWith("enc_gcm_v1:")) {
    return cipherText;
  }
  try {
    const [, ivHex, authTagHex, encryptedHex, ...rest] = cipherText.split(":");
    if (!ivHex || !authTagHex || encryptedHex === undefined || rest.length > 0) return "";
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    // Reject truncated tags; GCM otherwise accepts tags as short as 4 bytes.
    if (iv.length !== GCM_IV_BYTES || authTag.length !== GCM_AUTH_TAG_BYTES) return "";
    const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", resolveVaultKey(masterKey), iv, {
      authTagLength: GCM_AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "";
  }
}
