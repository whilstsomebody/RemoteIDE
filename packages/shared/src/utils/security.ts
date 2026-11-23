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

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // 1. Check exact metadata hostname
  if (BLOCKED_METADATA_HOSTNAMES.has(hostname)) {
    return { blocked: true, reason: `Target host "${hostname}" is a forbidden cloud metadata endpoint.` };
  }

  // 2. IPv4 Link-Local (169.254.0.0/16)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { blocked: true, reason: "Target host belongs to the forbidden link-local address range (169.254.0.0/16)." };
  }

  // 3. IPv6 Link-Local (fe80::/10) or AWS IPv6 metadata (fd00:ec2::254)
  if (hostname.startsWith("fe80:") || hostname === "fd00:ec2::254") {
    return { blocked: true, reason: "Target host is a forbidden link-local or cloud metadata IPv6 address." };
  }

  // 4. Multicast and broadcast
  if (/^2(?:2[4-9]|3\d)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname === "255.255.255.255") {
    return { blocked: true, reason: "Target host belongs to multicast or broadcast address range." };
  }

  return { blocked: false };
}
