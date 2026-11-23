export function generateUuid(): string {
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  // randomUUID is limited to secure contexts in browsers, but getRandomValues is not.
  // IDs double as session and resource identifiers, so never use Math.random().
  if (typeof webCrypto?.getRandomValues !== "function") {
    throw new Error("A cryptographically secure random source is required to generate IDs");
  }
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateId(prefix?: string): string {
  const uuid = generateUuid();
  return prefix ? `${prefix}_${uuid.replace(/-/g, "")}` : uuid;
}

export const createId = generateId;

export function generateRequestId(): string {
  return generateId("req");
}

export function generateCorrelationId(): string {
  return generateId("corr");
}

export function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
