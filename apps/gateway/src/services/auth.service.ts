import { GatewayStateStore, gatewayStateStore } from "./state-store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as process from "node:process";
import {
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  generateTotpSecret,
  verifyTotpCode,
  generateBackupCodes,
  hashBackupCode,
  verifyAndConsumeBackupCode,
  encryptSecret,
  decryptSecret,
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
  mfaEnabled?: boolean;
  mfaSecret?: string;
  mfaBackupCodes?: string[];
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
  private pendingMfaSetup = new Map<string, { secret: string; backupCodes: string[]; expiresAt: number }>();
  private pendingMfaTickets = new Map<
    string,
    { userId: string; expiresAt: number; deviceName?: string; ipAddress: string; userAgent?: string }
  >();
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
    const custom = process.env.SETUP_TOKEN || process.env.LOCAL_SETUP_TOKEN;
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

    if (this.isOwnerBootstrapped()) {
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        "Owner account is already initialized on this host",
        {
          statusCode: 409,
        }
      );
    }

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

    this.failedAttempts.delete(rateLimitKey);

    if (user.mfaEnabled) {
      const mfaTicket = `mfa_${generateSecureRandomToken(16)}`;
      this.pendingMfaTickets.set(mfaTicket, {
        userId: user.id,
        expiresAt: Date.now() + 5 * 60 * 1000,
        deviceName: params.deviceName,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
      return {
        mfaRequired: true,
        mfaTicket,
      } as any;
    }

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

    if (stored.isRevoked) return null;

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

  public getUserById(userId: string): StoredUser | undefined {
    for (const user of this.users.values()) {
      if (user.id === userId) return user;
    }
    return undefined;
  }

  public setupMfa(userId: string): { secret: string; otpauthUrl: string; backupCodes: string[] } {
    const user = this.getUserById(userId);
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, "User not found", { statusCode: 404 });

    const secret = generateTotpSecret();
    const backupCodes = generateBackupCodes(8);
    this.pendingMfaSetup.set(userId, {
      secret,
      backupCodes,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    const otpauthUrl = `otpauth://totp/RemoteIDE:${encodeURIComponent(user.email)}?secret=${secret}&issuer=RemoteIDE`;
    return { secret, otpauthUrl, backupCodes };
  }

  public verifyAndEnableMfa(userId: string, code: string): { enabled: boolean; backupCodes: string[] } {
    const pending = this.pendingMfaSetup.get(userId);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new AppError(ErrorCode.BAD_REQUEST, "MFA setup expired or not initiated. Please start setup again.");
    }

    const isValid = verifyTotpCode(code, pending.secret);
    if (!isValid) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid verification code. Please check your authenticator app.");
    }

    const user = this.getUserById(userId);
    if (!user) throw new AppError(ErrorCode.NOT_FOUND, "User not found");

    user.mfaEnabled = true;
    user.mfaSecret = encryptSecret(pending.secret);
    user.mfaBackupCodes = pending.backupCodes.map(hashBackupCode);
    this.pendingMfaSetup.delete(userId);
    this.persist();

    return { enabled: true, backupCodes: pending.backupCodes };
  }

  public disableMfa(userId: string, codeOrBackup: string): boolean {
    const user = this.getUserById(userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new AppError(ErrorCode.BAD_REQUEST, "MFA is not enabled for this user.");
    }

    const decryptedSecret = decryptSecret(user.mfaSecret);
    const isTotpValid = verifyTotpCode(codeOrBackup, decryptedSecret);
    let isBackupValid = false;
    if (!isTotpValid && user.mfaBackupCodes) {
      const backupResult = verifyAndConsumeBackupCode(codeOrBackup, user.mfaBackupCodes);
      isBackupValid = backupResult.valid;
    }

    if (!isTotpValid && !isBackupValid) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid code. Cannot disable MFA without verification.");
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    user.mfaBackupCodes = undefined;
    this.persist();
    return true;
  }

  public authenticateMfa(
    mfaTicket: string,
    code: string
  ): { user: StoredUser; session: RemoteSession; sessionToken: string } {
    const ticket = this.pendingMfaTickets.get(mfaTicket);
    if (!ticket || ticket.expiresAt < Date.now()) {
      this.pendingMfaTickets.delete(mfaTicket);
      throw new AppError(ErrorCode.UNAUTHORIZED, "MFA authentication session expired. Please log in again.");
    }

    const user = this.getUserById(ticket.userId);
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new AppError(ErrorCode.BAD_REQUEST, "MFA is not configured for this account.");
    }

    const decryptedSecret = decryptSecret(user.mfaSecret);
    const isTotpValid = verifyTotpCode(code, decryptedSecret);
    let isBackupValid = false;

    if (!isTotpValid && user.mfaBackupCodes) {
      const backupResult = verifyAndConsumeBackupCode(code, user.mfaBackupCodes);
      if (backupResult.valid) {
        isBackupValid = true;
        user.mfaBackupCodes = backupResult.remainingHashedCodes;
        this.persist();
      }
    }

    if (!isTotpValid && !isBackupValid) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid MFA code or backup recovery code.");
    }

    this.pendingMfaTickets.delete(mfaTicket);
    user.lastLoginAt = new Date().toISOString();

    const { session, sessionToken } = this.createSessionInternal({
      userId: user.id,
      hostId: "local-host-agent",
      role: user.role,
      capabilities: ROLE_PERMISSIONS[user.role],
      allowedWorkspaceIds: [],
      deviceName: ticket.deviceName || "Web Browser",
      ipAddress: ticket.ipAddress,
      userAgent: ticket.userAgent || "",
      isOwner: user.isOwner,
      durationSeconds: 7 * 24 * 3600,
    });

    return { user, session, sessionToken };
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
