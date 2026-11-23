import { GatewayStateStore, gatewayStateStore } from "./state-store.js";
import {
  ShareLink,
  UserRole,
  CreateShareLinkDto,
  RedeemShareLinkDto,
  ROLE_PERMISSIONS,
  AuditEventType,
  createId,
  sha256Sync,
  generateSecureRandomToken,
  AppError,
  ErrorCode,
  RemoteSession,
} from "@remote-ide/shared";
import { safeCompare } from "./crypto.js";
import { auditService } from "./audit.service.js";
import { authService } from "./auth.service.js";

export interface StoredShareLink {
  id: string;
  name: string;
  tokenHash: string;
  role: ShareLink["role"];
  allowedWorkspaceIds: string[];
  expiresAt: string;
  oneTimeRedemption: boolean;
  pinHash?: string;
  maxConcurrentSessions: number;
  usedCount: number;
  isRevoked: boolean;
  revokedAt?: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}

export class ShareLinkService {
  private links = new Map<string, StoredShareLink>(); // id -> StoredShareLink
  private tokenHashToId = new Map<string, string>(); // tokenHash -> id

  constructor(private stateStore?: GatewayStateStore) {
    const links = stateStore?.read<[string, StoredShareLink][]>("share-links");
    if (links) {
      this.links = new Map(links);
      for (const link of this.links.values()) this.tokenHashToId.set(link.tokenHash, link.id);
    }
  }
  private persist(): void {
    this.stateStore?.write("share-links", [...this.links]);
  }

  public createShareLink(
    actorId: string,
    dto: CreateShareLinkDto
  ): { shareLink: ShareLink; rawToken: string; accessUrl: string } {
    if (dto.role === UserRole.OWNER) {
      throw new AppError(ErrorCode.FORBIDDEN, "Owner access cannot be delegated through a share link");
    }
    const rawToken = generateSecureRandomToken(32);
    const tokenHash = sha256Sync(rawToken);
    const linkId = createId("link");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + dto.expiresInSeconds * 1000).toISOString();

    let pinHash: string | undefined;
    if (dto.pin && dto.pin.trim()) {
      pinHash = sha256Sync(`${dto.pin.trim()}:${tokenHash}`);
    }

    const stored: StoredShareLink = {
      id: linkId,
      name: dto.name,
      tokenHash,
      role: dto.role,
      allowedWorkspaceIds: dto.allowedWorkspaceIds,
      expiresAt,
      oneTimeRedemption: dto.oneTimeRedemption,
      pinHash,
      maxConcurrentSessions: dto.maxConcurrentSessions,
      usedCount: 0,
      isRevoked: false,
      createdBy: actorId,
      createdAt: now.toISOString(),
    };

    this.links.set(linkId, stored);
    this.tokenHashToId.set(tokenHash, linkId);
    this.persist();

    auditService.record(AuditEventType.SHARE_LINK_CREATED, actorId, {
      targetId: linkId,
      metadata: {
        role: dto.role,
        oneTimeRedemption: dto.oneTimeRedemption,
        hasPin: !!pinHash,
        expiresAt,
        allowedWorkspacesCount: dto.allowedWorkspaceIds.length,
      },
    });

    const accessUrl = `/share?token=${rawToken}`;
    return {
      shareLink: this.toShareLink(stored),
      rawToken,
      accessUrl,
    };
  }

  public redeemShareLink(
    dto: RedeemShareLinkDto,
    ipAddress: string,
    userAgent?: string
  ): { session: RemoteSession; sessionToken: string } {
    const tokenHash = sha256Sync(dto.token);
    const linkId = this.tokenHashToId.get(tokenHash);
    if (!linkId) {
      auditService.record(AuditEventType.SHARE_LINK_REDEEMED, "anonymous", {
        ipAddress,
        metadata: { error: "not_found" },
      });
      throw new AppError(ErrorCode.NOT_FOUND, "Share link not found or invalid", {
        statusCode: 404,
      });
    }

    const link = this.links.get(linkId);
    if (!link || link.isRevoked) {
      throw new AppError(ErrorCode.UNAUTHORIZED, "Share link has been revoked", {
        statusCode: 401,
      });
    }

    if (new Date(link.expiresAt).getTime() < Date.now()) {
      auditService.record(AuditEventType.SHARE_LINK_EXPIRED, link.createdBy, {
        targetId: link.id,
      });
      throw new AppError(ErrorCode.UNAUTHORIZED, "Share link has expired", { statusCode: 410 });
    }

    if (link.oneTimeRedemption && link.usedCount > 0) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        "Share link was configured for single-use and has already been redeemed",
        { statusCode: 410 }
      );
    }

    if (link.pinHash) {
      if (!dto.pin) {
        throw new AppError(ErrorCode.UNAUTHORIZED, "This link requires a PIN/Passphrase", {
          statusCode: 401,
          details: [{ field: "pin", message: "PIN required" }],
        });
      }
      const candidatePinHash = sha256Sync(`${dto.pin.trim()}:${tokenHash}`);
      if (!safeCompare(candidatePinHash, link.pinHash)) {
        auditService.record(AuditEventType.SHARE_LINK_REDEEMED, "anonymous", {
          targetId: link.id,
          ipAddress,
          metadata: { error: "invalid_pin" },
        });
        throw new AppError(ErrorCode.UNAUTHORIZED, "Invalid PIN/Passphrase for share link", {
          statusCode: 401,
        });
      }
    }

    if (
      link.maxConcurrentSessions > 0 &&
      authService.countSessionsForShareLink(link.id) >= link.maxConcurrentSessions
    ) {
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        `Maximum concurrent sessions (${link.maxConcurrentSessions}) reached for this access link`,
        { statusCode: 429 }
      );
    }

    link.usedCount += 1;
    link.lastUsedAt = new Date().toISOString();
    this.persist();

    // Cap session duration by link expiry (or max 8 hours)
    const linkRemainingMs = Math.max(1000, new Date(link.expiresAt).getTime() - Date.now());
    const sessionDurationSec = Math.min(8 * 3600, Math.floor(linkRemainingMs / 1000));

    const { session, sessionToken } = authService.createSessionInternal({
      userId: `guest-${link.id.slice(-6)}`,
      hostId: "local-host-agent",
      role: link.role,
      capabilities: ROLE_PERMISSIONS[link.role],
      allowedWorkspaceIds: link.allowedWorkspaceIds,
      deviceName: dto.deviceName || "Shared Remote Browser",
      ipAddress,
      userAgent: userAgent || "",
      isOwner: false,
      durationSeconds: sessionDurationSec,
      shareLinkId: link.id,
    });

    auditService.record(AuditEventType.SHARE_LINK_REDEEMED, session.userId, {
      targetId: link.id,
      ipAddress,
      userAgent,
      metadata: { sessionId: session.id, role: link.role },
    });

    return { session, sessionToken };
  }

  public revokeShareLink(linkId: string, actorId: string): boolean {
    const link = this.links.get(linkId);
    if (!link || link.isRevoked) return false;

    link.isRevoked = true;
    link.revokedAt = new Date().toISOString();
    this.persist();

    authService.revokeAllSessionsForShareLink(linkId);

    auditService.record(AuditEventType.SHARE_LINK_REVOKED, actorId, {
      targetId: linkId,
    });

    return true;
  }

  public listShareLinks(): ShareLink[] {
    return Array.from(this.links.values()).map((l) => this.toShareLink(l));
  }

  public getShareLinkById(id: string): ShareLink | null {
    const link = this.links.get(id);
    if (!link) return null;
    return this.toShareLink(link);
  }

  private toShareLink(l: StoredShareLink): ShareLink {
    return {
      id: l.id,
      name: l.name,
      role: l.role,
      allowedWorkspaceIds: l.allowedWorkspaceIds,
      expiresAt: l.expiresAt,
      oneTimeRedemption: l.oneTimeRedemption,
      hasPin: !!l.pinHash,
      maxConcurrentSessions: l.maxConcurrentSessions,
      usedCount: l.usedCount,
      isRevoked: l.isRevoked,
      createdAt: l.createdAt,
      lastUsedAt: l.lastUsedAt,
    };
  }
}

export const shareLinkService = new ShareLinkService(gatewayStateStore);
