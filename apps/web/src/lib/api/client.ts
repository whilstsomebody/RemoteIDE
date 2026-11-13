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
  if (url.origin === new URL(GATEWAY_URL).origin) {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("remote_ide_token") : null;
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "include" });
  }
  return fetch(input, { ...init, headers });
}

export function authenticatedWebSocketUrl(url: string): string {
  const result = new URL(url);
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("remote_ide_token") : null;
  if (token) result.searchParams.set("token", token);
  return result.toString();
}
