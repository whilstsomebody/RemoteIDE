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

/**
 * Checks a literal IP address (IPv4, IPv6, or IPv4-mapped IPv6) against the
 * metadata / link-local / multicast blocklist. Used both for URL hosts and for
 * DNS-resolved addresses so a hostname cannot alias a blocked IP.
 */
export function isSsrfBlockedAddress(address: string): { blocked: boolean; reason?: string } {
  let host = address.toLowerCase().replace(/^\[|\]$/g, "");

  const mapped = host.match(/^::ffff:(?:(\d{1,3}(?:\.\d{1,3}){3})|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    if (mapped[1]) {
      host = mapped[1];
    } else {
      const hi = parseInt(mapped[2]!, 16);
      const lo = parseInt(mapped[3]!, 16);
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
 * Returns true if the URL is dangerous/blocked.
 */
export function isSsrfDangerousTarget(rawUrl: string): { blocked: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `http://${rawUrl}`);
  } catch {
    return { blocked: true, reason: "Malformed URL" };
  }

  // A trailing dot is the same DNS name ("metadata.google.internal.").
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");

  const addressCheck = isSsrfBlockedAddress(hostname);
  if (addressCheck.blocked) return addressCheck;

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (SSRF_BLOCKED_PORTS.has(port)) {
    return { blocked: true, reason: `Target port ${port} is a forbidden internal infrastructure port.` };
  }

  return { blocked: false };
}
