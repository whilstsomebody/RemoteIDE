/**
 * Common cloud metadata endpoints and IP ranges forbidden from arbitrary client requests.
 */
export const BLOCKED_METADATA_HOSTNAMES = new Set([
  "169.254.169.254", // AWS / Azure / GCP / OpenStack metadata
  "metadata.google.internal", // Google Cloud metadata
  "metadata.goog", // Google Cloud metadata
  "instance-data", // OpenStack metadata
  "100.100.100.200", // Alibaba Cloud metadata
]);

/**
 * Reserved internal infrastructure ports forbidden from remote preview and forwarding.
 */
export const BLOCKED_INTERNAL_INFRA_PORTS = new Set([
  22, // SSH
  2375, // Docker plain socket
  2376, // Docker TLS socket
  2379, // etcd client
  2380, // etcd peer
  3306, // MySQL
  4000, // RemoteIDE Gateway default
  4001, // RemoteIDE Host Agent default
  5432, // PostgreSQL
  6379, // Redis
  6443, // Kubernetes API
  8443, // Kubernetes API TLS
  9092, // Apache Kafka
  9200, // Elasticsearch
  27017, // MongoDB
]);

/**
 * Infrastructure ports the outbound HTTP client must never reach (README SSRF policy).
 */
export const SSRF_BLOCKED_PORTS = new Set([
  2375, // Docker plain socket
  2376, // Docker TLS socket
  5432, // PostgreSQL
  6379, // Redis
  9092, // Apache Kafka
]);

// IPv6 forms that embed an IPv4 address in their last 32 bits: IPv4-mapped (::ffff:),
// deprecated IPv4-compatible (::) and NAT64 (64:ff9b::). The URL parser rewrites the
// embedded address to two hex groups, e.g. [::ffff:169.254.169.254] -> ::ffff:a9fe:a9fe.
const EMBEDDED_IPV4 =
  /^(?:::ffff:|::|64:ff9b::)(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/;

/**
 * Checks a literal IP address (IPv4, IPv6, or IPv6 with an embedded IPv4) or hostname
 * against the metadata / link-local / multicast blocklist. Used both for URL hosts and
 * for DNS-resolved addresses so a hostname cannot alias a blocked IP.
 */
export function isSsrfBlockedAddress(address: string): { blocked: boolean; reason?: string } {
  // A trailing dot is the same DNS name ("metadata.google.internal.").
  let host = address.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");

  const embedded = host.match(EMBEDDED_IPV4);
  if (embedded) {
    if (embedded[1]) {
      host = embedded[1];
    } else {
      const hi = parseInt(embedded[2]!, 16);
      const lo = parseInt(embedded[3]!, 16);
      host = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    }
  }

  if (BLOCKED_METADATA_HOSTNAMES.has(host)) {
    return { blocked: true, reason: `Target host "${host}" is a forbidden cloud metadata endpoint.` };
  }

  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return { blocked: true, reason: "Target host belongs to the forbidden link-local address range (169.254.0.0/16)." };
  }

  if (/^fe[89ab][0-9a-f]?:/.test(host) || host === "fd00:ec2::254") {
    return { blocked: true, reason: "Target host is a forbidden link-local or cloud metadata IPv6 address." };
  }

  if (/^2(?:2[4-9]|3\d)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || host === "255.255.255.255") {
    return { blocked: true, reason: "Target host belongs to multicast or broadcast address range." };
  }

  return { blocked: false };
}

/**
 * Validates whether a target URL violates Server-Side Request Forgery (SSRF) restrictions.
 * Scheme-less input is treated as http://. Returns `blocked: true` with a reason when the
 * URL uses a non-HTTP scheme or targets a blocked host or port.
 */
export function isSsrfDangerousTarget(rawUrl: string): { blocked: boolean; reason?: string } {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return { blocked: true, reason: "Malformed URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { blocked: true, reason: `Scheme "${parsed.protocol}" is not allowed; use http or https.` };
  }

  const addressCheck = isSsrfBlockedAddress(parsed.hostname);
  if (addressCheck.blocked) return addressCheck;

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (SSRF_BLOCKED_PORTS.has(port)) {
    return { blocked: true, reason: `Target port ${port} is a forbidden internal infrastructure port.` };
  }

  return { blocked: false };
}
