const defaultGateway = typeof window === "undefined"
  ? "http://localhost:4000"
  : `${window.location.protocol}//${window.location.hostname}:4000`;

export const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL || defaultGateway).replace(/\/$/, "");
export const GATEWAY_WS_URL = process.env.NEXT_PUBLIC_GATEWAY_WS_URL ||
  `${GATEWAY_URL.replace(/^http/, "ws")}/api/v1/ws`;

export async function gatewayFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const url = new URL(input instanceof Request ? input.url : String(input), GATEWAY_URL);
  // Relative paths are resolved against the gateway so the request goes to the same origin the token is scoped to.
  const target = input instanceof Request ? input : url;
  if (url.origin === new URL(GATEWAY_URL).origin) {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("remote_ide_token") : null;
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return fetch(target, { ...init, headers, credentials: "include" });
  }
  return fetch(target, { ...init, headers });
}

function isGatewayWebSocketHost(url: URL): boolean {
  const hosts = new Set([new URL(GATEWAY_URL).host]);
  try {
    hosts.add(new URL(GATEWAY_WS_URL).host);
  } catch {
    // Malformed override; fall back to the HTTP gateway host only.
  }
  return hosts.has(url.host);
}

export function authenticatedWebSocketUrl(url: string): string {
  const result = new URL(url);
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("remote_ide_token") : null;
  if (token && isGatewayWebSocketHost(result)) result.searchParams.set("token", token);
  return result.toString();
}
