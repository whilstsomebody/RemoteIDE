import { GatewayStateStore, gatewayStateStore } from "./state-store.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  RemoteSession,
  AuditEventType,
  createId,
  sha256Sync,
  generateSecureRandomToken,
  AppError,
  ErrorCode,
} from "@remote-ide/shared";
import { hashPassword, verifyPassword } from "./crypto.js";
import { auditService } from "./audit.service.js";
import { tunnelRelayService } from "./tunnel-relay.service.js";

export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  isOwner: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface StoredSession {
  id: string;
  tokenHash: string;
  userId: string;
  hostId: string;
  role: UserRole;
  capabilities: Permission[];
  allowedWorkspaceIds: string[];
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  isOwner: boolean;
  shareLinkId?: string;
  createdAt: string;
  expiresAt: string;
  isRevoked: boolean;
  revokedAt?: string;
  lastActiveAt: string;
}

export class AuthService {
  private users = new Map<string, StoredUser>(); // email -> StoredUser
  private sessions = new Map<string, StoredSession>(); // sessionId -> StoredSession
  private tokenHashToSessionId = new Map<string, string>(); // tokenHash -> sessionId
  private failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
  private localSetupToken: string;
  private onSessionRevoked?: (sessionId: string) => void;

  constructor(private stateStore?: GatewayStateStore) {
    this.localSetupToken = this.initializeLocalSetupToken();
    const state = stateStore?.read<{
      users: [string, StoredUser][];
      sessions: [string, StoredSession][];
    }>("auth");
    if (state) {
      this.users = new Map(state.users);
      this.sessions = new Map(state.sessions);
      for (const session of this.sessions.values())
        this.tokenHashToSessionId.set(session.tokenHash, session.id);
    }
  }

  private persist(): void {
    this.stateStore?.write("auth", { users: [...this.users], sessions: [...this.sessions] });
  }

  public countSessionsForShareLink(linkId: string): number {
    return [...this.sessions.values()].filter(
      (s) => s.shareLinkId === linkId && !s.isRevoked && Date.parse(s.expiresAt) > Date.now()
    ).length;
  }

  public setRevocationHandler(handler: (sessionId: string) => void): void {
    this.onSessionRevoked = handler;
  }

  public getSetupToken(): string {
    return this.localSetupToken;
  }

  private initializeLocalSetupToken(): string {
    const custom = process.env.LOCAL_SETUP_TOKEN;
    if (custom) return custom;

    const tokenDir = path.join(os.homedir(), ".remoteide");
    const tokenFile = path.join(tokenDir, "setup-token");
    try {
      if (fs.existsSync(tokenFile)) {
        const stored = fs.readFileSync(tokenFile, "utf-8").trim();
        if (stored) return stored;
      }
      fs.mkdirSync(tokenDir, { recursive: true });
      const newToken = generateSecureRandomToken(16);
      fs.writeFileSync(tokenFile, newToken, { mode: 0o600 });
      return newToken;
    } catch {
      return generateSecureRandomToken(16);
    }
  }

  public isOwnerBootstrapped(): boolean {
    for (const user of this.users.values()) {
      if (user.isOwner) return true;
    }
    return false;
  }

  public async bootstrapOwner(params: {
    email: string;
    password: string;
    displayName: string;
    localSetupToken: string;
    remoteIp: string;
    userAgent?: string;
  }): Promise<{ user: StoredUser; session: RemoteSession; sessionToken: string }> {
    // 1. MUST only be called from loopback
    const isLoopback =
      params.remoteIp === "127.0.0.1" ||
      params.remoteIp === "::1" ||
      params.remoteIp === "::ffff:127.0.0.1" ||
      params.remoteIp === "localhost";

    if (!isLoopback) {
      auditService.record(AuditEventType.OWNER_BOOTSTRAP, "anonymous", {
        ipAddress: params.remoteIp,
        metadata: { status: "rejected_non_loopback" },
      });
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Owner account initialization is only permitted from trusted local loopback (127.0.0.1)",
        { statusCode: 403 }
      );
    }

    // 2. Validate setup token
    if (params.localSetupToken !== this.localSetupToken) {
      auditService.record(AuditEventType.OWNER_BOOTSTRAP, "anonymous", {
        ipAddress: params.remoteIp,
        metadata: { status: "rejected_invalid_setup_token" },
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid local setup bootstrap token", {
        statusCode: 401,
      });
    }

    // 3. Ensure not already bootstrapped
    if (this.isOwnerBootstrapped()) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        "Owner account is already initialized on this host",
        {
          statusCode: 409,
        }
      );
    }

    // 4. Create owner
    const passwordHash = await hashPassword(params.password);
    if (this.isOwnerBootstrapped()) {
      throw new AppError(ErrorCode.CONFLICT, "Owner account is already initialized", {
        statusCode: 409,
      });
    }
    const userId = createId("user");
    const ownerUser: StoredUser = {
      id: userId,
      email: params.email.toLowerCase(),
      displayName: params.displayName,
      passwordHash,
      role: UserRole.OWNER,
      isOwner: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    this.users.set(ownerUser.email, ownerUser);

    auditService.record(AuditEventType.OWNER_BOOTSTRAP, userId, {
      ipAddress: params.remoteIp,
      userAgent: params.userAgent,
      metadata: { email: params.email },
    });

    // 5. Create initial owner session
    const { session, sessionToken } = this.createSessionInternal({
      userId,
      hostId: "local-host-agent",
      role: UserRole.OWNER,
      capabilities: ROLE_PERMISSIONS[UserRole.OWNER],
      allowedWorkspaceIds: [],
      deviceName: "Host Machine (Local Setup)",
      ipAddress: params.remoteIp,
      userAgent: params.userAgent || "Local CLI",
      isOwner: true,
      durationSeconds: 30 * 24 * 3600, // 30 days
    });

    return { user: ownerUser, session, sessionToken };
  }

  public async login(params: {
    email: string;
    password: string;
    deviceName?: string;
    ipAddress: string;
    userAgent?: string;
  }): Promise<{ user: StoredUser; session: RemoteSession; sessionToken: string }> {
    const emailKey = params.email.toLowerCase();
    const rateLimitKey = `${params.ipAddress}:${emailKey}`;

    // Rate limit check
    const rateLimit = this.failedAttempts.get(rateLimitKey);
    if (rateLimit && rateLimit.lockedUntil > Date.now()) {
      const waitSec = Math.ceil((rateLimit.lockedUntil - Date.now()) / 1000);
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        `Too many failed login attempts. Account temporarily locked for ${waitSec} seconds.`,
        { statusCode: 429 }
      );
    }

    const user = this.users.get(emailKey);
    if (!user) {
      this.recordFailedAttempt(rateLimitKey);
      auditService.record(AuditEventType.LOGIN_FAILURE, emailKey, {
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: { reason: "user_not_found" },
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid email or password", { statusCode: 401 });
    }

    const isValidPassword = await verifyPassword(params.password, user.passwordHash);
    if (!isValidPassword) {
      this.recordFailedAttempt(rateLimitKey);
      auditService.record(AuditEventType.LOGIN_FAILURE, user.id, {
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: { reason: "invalid_password" },
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid email or password", { statusCode: 401 });
    }

    // Success -> Clear rate limit
    this.failedAttempts.delete(rateLimitKey);
    user.lastLoginAt = new Date().toISOString();

    auditService.record(AuditEventType.LOGIN_SUCCESS, user.id, {
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    const { session, sessionToken } = this.createSessionInternal({
      userId: user.id,
      hostId: "local-host-agent",
      role: user.role,
      capabilities: ROLE_PERMISSIONS[user.role],
      allowedWorkspaceIds: [],
      deviceName: params.deviceName || "Web Browser",
      ipAddress: params.ipAddress,
      userAgent: params.userAgent || "",
      isOwner: user.isOwner,
      durationSeconds: 7 * 24 * 3600, // 7 days
    });

    return { user, session, sessionToken };
  }

  private recordFailedAttempt(key: string): void {
    const existing = this.failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
    existing.count += 1;
    if (existing.count >= 5) {
      existing.lockedUntil = Date.now() + 5 * 60 * 1000; // 5 min lockout
    }
    this.failedAttempts.set(key, existing);
  }

  public createSessionInternal(params: {
    userId: string;
    hostId: string;
    role: UserRole;
    capabilities: Permission[];
    allowedWorkspaceIds: string[];
    deviceName: string;
    ipAddress: string;
    userAgent: string;
    isOwner: boolean;
    durationSeconds: number;
    shareLinkId?: string;
  }): { session: RemoteSession; sessionToken: string } {
    const rawToken = generateSecureRandomToken(32);
    const tokenHash = sha256Sync(rawToken);
    const sessionId = createId("sess");
    const now = new Date();
    const duration = params.durationSeconds ?? 3600;
    const expiresAt = new Date(now.getTime() + duration * 1000).toISOString();

    const stored: StoredSession = {
      id: sessionId,
      tokenHash,
      userId: params.userId,
      hostId: params.hostId,
      role: params.role,
      capabilities: params.capabilities,
      allowedWorkspaceIds: params.allowedWorkspaceIds,
      deviceName: params.deviceName,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      isOwner: params.isOwner,
      shareLinkId: params.shareLinkId,
      createdAt: now.toISOString(),
      expiresAt,
      isRevoked: false,
      lastActiveAt: now.toISOString(),
    };

    this.sessions.set(sessionId, stored);
    this.tokenHashToSessionId.set(tokenHash, sessionId);
    this.persist();

    return { session: this.toRemoteSession(stored), sessionToken: rawToken };
  }

  public getSessionByToken(rawToken: string): RemoteSession | null {
    const tokenHash = sha256Sync(rawToken);
    const sessionId = this.tokenHashToSessionId.get(tokenHash);
    if (!sessionId) return null;

    const stored = this.sessions.get(sessionId);
    if (!stored) return null;

    // Check revocation
    if (stored.isRevoked) return null;

    // Check expiry
    if (new Date(stored.expiresAt).getTime() < Date.now()) {
      auditService.record(AuditEventType.SESSION_EXPIRED, stored.userId, {
        targetId: stored.id,
      });
      return null;
    }

    stored.lastActiveAt = new Date().toISOString();
    return this.toRemoteSession(stored);
  }

  public getSessionById(sessionId: string): RemoteSession | null {
    const stored = this.sessions.get(sessionId);
    if (!stored || stored.isRevoked || Date.parse(stored.expiresAt) <= Date.now()) return null;
    return this.toRemoteSession(stored);
  }

  public listActiveSessions(): RemoteSession[] {
    const now = Date.now();
    const result: RemoteSession[] = [];
    for (const stored of this.sessions.values()) {
      if (!stored.isRevoked && new Date(stored.expiresAt).getTime() > now) {
        result.push(this.toRemoteSession(stored));
      }
    }
    return result;
  }

  public revokeSession(sessionId: string, actorId: string): boolean {
    const stored = this.sessions.get(sessionId);
    if (!stored || stored.isRevoked) return false;

    stored.isRevoked = true;
    stored.revokedAt = new Date().toISOString();
    this.persist();

    auditService.record(AuditEventType.SESSION_REVOKED, actorId, {
      targetId: sessionId,
      metadata: { role: stored.role, deviceName: stored.deviceName },
    });

    // Notify tunnel relay to drop all active WebSockets immediately
    if (this.onSessionRevoked) {
      this.onSessionRevoked(sessionId);
    }

    return true;
  }

  public revokeAllSessionsForShareLink(shareLinkId: string): void {
    for (const stored of this.sessions.values()) {
      if (stored.shareLinkId === shareLinkId && !stored.isRevoked) {
        this.revokeSession(stored.id, "system");
      }
    }
  }

  private toRemoteSession(s: StoredSession): RemoteSession {
    return {
      id: s.id,
      userId: s.userId,
      hostId: s.hostId,
      role: s.role,
      capabilities: s.capabilities,
      allowedWorkspaceIds: s.allowedWorkspaceIds,
      deviceName: s.deviceName,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      isOwner: s.isOwner,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isRevoked: s.isRevoked,
      revokedAt: s.revokedAt,
    };
  }
}

export const authService = new AuthService(gatewayStateStore);
authService.setRevocationHandler((sessionId) => {
  tunnelRelayService.terminateSessionSockets(sessionId);
});
