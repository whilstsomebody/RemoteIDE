import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encodes a buffer to a standard Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string to a Buffer.
 */
export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]!);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random Base32 secret for TOTP MFA setup (20 bytes = 160 bits).
 */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength));
}

/**
 * Generates an RFC 6238 TOTP 6-digit code for a given secret.
 */
export function generateTotpCode(secret: string, timeStepSeconds = 30, epochMs = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(epochMs / 1000 / timeStepSeconds);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac("sha1", key);
  hmac.update(counterBuf);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  const code = (binary % 1000000).toString().padStart(6, "0");
  return code;
}

/**
 * Verifies a 6-digit TOTP code against a secret within an acceptable time window (+/- 1 step).
 */
export function verifyTotpCode(
  code: string,
  secret: string,
  windowSteps = 1,
  timeStepSeconds = 30,
  epochMs = Date.now()
): boolean {
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) return false;

  const currentCounter = Math.floor(epochMs / 1000 / timeStepSeconds);

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const candidateCounter = currentCounter + offset;
    const candidateMs = candidateCounter * timeStepSeconds * 1000;
    const generated = generateTotpCode(secret, timeStepSeconds, candidateMs);
    if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(generated))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an array of single-use backup recovery codes.
 */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars (e.g. 4A8B9C1E)
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * Hash a backup code using SHA-256 for secure storage.
 */
export function hashBackupCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/-/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Verifies and consumes a backup recovery code against a list of hashed backup codes.
 */
export function verifyAndConsumeBackupCode(
  inputCode: string,
  hashedCodes: string[]
): { valid: boolean; remainingHashedCodes: string[] } {
  const targetHash = hashBackupCode(inputCode);
  const index = hashedCodes.findIndex((h) => crypto.timingSafeEqual(Buffer.from(h), Buffer.from(targetHash)));

  if (index !== -1) {
    const remaining = [...hashedCodes];
    remaining.splice(index, 1);
    return { valid: true, remainingHashedCodes: remaining };
  }

  return { valid: false, remainingHashedCodes: hashedCodes };
}
