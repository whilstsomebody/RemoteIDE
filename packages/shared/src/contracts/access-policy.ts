import { Permission } from "./capabilities.js";

/** Decode route segments independently; query values never select a capability. */
export function routeSegments(url: string): string[] {
  return url.split("?")[0]!.split("/").filter(Boolean).map(decodeURIComponent);
}

export function requiredRequestPermission(method: string, url: string, body?: unknown): Permission {
  const segments = routeSegments(url);
  const resource = segments[2] === "workspaces" ? segments[4] : segments[2];
  const action = segments[segments.length - 1];
  const read = method === "GET" || method === "HEAD";
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (resource === "terminal" || resource === "terminals") return Permission.TERMINAL_ACCESS;
  if (resource === "git") {
    if (
      action === "discard" ||
      action === "delete" ||
      data.force === true ||
      data.amend === true ||
      (action === "stash" && data.action === "drop")
    )
      return Permission.GIT_DESTRUCTIVE;
    if (["push", "pull", "fetch"].includes(action || "")) return Permission.GIT_PUSH;
    return read ? Permission.GIT_READ : Permission.GIT_WRITE;
  }
  if (resource === "processes") return read ? Permission.FS_READ : Permission.PROCESS_CONTROL;
  if (resource === "ports") return read ? Permission.FS_READ : Permission.PORT_FORWARD;
  if (resource === "preview") return Permission.PREVIEW_ACCESS;
  if (resource === "api-client") return Permission.TASK_EXECUTE;
  if (resource === "jobs") return read ? Permission.FS_READ : Permission.TASK_EXECUTE;
  if (method === "DELETE") return Permission.FS_DELETE;
  return read ? Permission.FS_READ : Permission.FS_WRITE;
}

export function isLoopbackAddress(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
