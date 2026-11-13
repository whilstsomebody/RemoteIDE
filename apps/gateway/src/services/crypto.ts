import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELIZATION = 1; // p

/**
 * Hashes a password using scrypt with a cryptographic salt.
 * Stored format: "scrypt$<saltHex>$<derivedKeyHex>"
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(`scrypt$${salt}$${derivedKey.toString("hex")}`);
      }
    );
  });
}

/**
 * Verifies a password against the stored scrypt hash using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parts = storedHash.split("$");
      if (parts.length !== 3 || parts[0] !== "scrypt") {
        return resolve(false);
      }
      const salt = parts[1];
      const expectedKeyHex = parts[2];
      if (!salt || !expectedKeyHex) {
        return resolve(false);
      }
      const expectedBuffer = Buffer.from(expectedKeyHex, "hex");

      crypto.scrypt(
        password,
        salt,
        expectedBuffer.length,
        { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
        (err, derivedKey) => {
          if (err) return resolve(false);
          if (derivedKey.length !== expectedBuffer.length) return resolve(false);
          resolve(crypto.timingSafeEqual(derivedKey, expectedBuffer));
        }
      );
    } catch {
      resolve(false);
    }
  });
}

/**
 * Constant-time comparison for token hashes and PINs.
 */
export function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
