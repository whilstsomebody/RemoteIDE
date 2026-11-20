import {
  HandoffPayload,
  CreateHandoffDto,
  ActiveDevice,
  detectDeviceFormFactor,
  generateId,
  AppError,
  ErrorCode,
  logger,
} from "@remote-ide/shared";
import { authService } from "./auth.service.js";

interface StoredHandoff extends HandoffPayload {
  consumed: boolean;
}

export class HandoffService {
  private handoffs = new Map<string, StoredHandoff>();

  public stageHandoff(params: {
    userId: string;
    sourceDeviceId: string;
    sourceDeviceName: string;
    sourceUserAgent: string;
    dto: CreateHandoffDto;
  }): HandoffPayload {
    const handoffId = generateId("hoff");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (params.dto.expiresInSeconds || 600) * 1000);

    const payload: StoredHandoff = {
      id: handoffId,
      sourceDeviceId: params.sourceDeviceId,
      sourceDeviceName: params.sourceDeviceName,
      sourceDeviceType: detectDeviceFormFactor(params.sourceUserAgent),
      targetDeviceId: params.dto.targetDeviceId,
      userId: params.userId,
      layout: params.dto.layout,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      consumed: false,
    };

    this.handoffs.set(handoffId, payload);
    logger.info(
      { handoffId, userId: params.userId, targetDeviceId: params.dto.targetDeviceId },
      "Staged cross-device workspace handoff"
    );

    return this.toPayload(payload);
  }

  public getPendingHandoff(userId: string, targetDeviceId?: string): HandoffPayload | null {
    const now = Date.now();
    for (const handoff of this.handoffs.values()) {
      if (handoff.consumed) continue;
      if (new Date(handoff.expiresAt).getTime() <= now) continue;
      if (handoff.userId !== userId) continue;

      if (targetDeviceId && handoff.targetDeviceId) {
        if (handoff.targetDeviceId === targetDeviceId) {
          return this.toPayload(handoff);
        }
      } else {
        // Return latest general handoff staged for this user
        return this.toPayload(handoff);
      }
    }
    return null;
  }

  public consumeHandoff(handoffId: string, userId: string): HandoffPayload {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff || handoff.consumed) {
      throw new AppError(ErrorCode.NOT_FOUND, "Handoff payload not found or already consumed");
    }

    if (new Date(handoff.expiresAt).getTime() <= Date.now()) {
      this.handoffs.delete(handoffId);
      throw new AppError(ErrorCode.NOT_FOUND, "Handoff has expired");
    }

    if (handoff.userId !== userId) {
      throw new AppError(ErrorCode.FORBIDDEN, "Unauthorized handoff access");
    }

    handoff.consumed = true;
    this.handoffs.delete(handoffId);

    logger.info({ handoffId, userId }, "Consumed cross-device workspace handoff");
    return this.toPayload(handoff);
  }

  public listActiveDevices(userId: string, currentSessionId?: string): ActiveDevice[] {
    const sessions = authService.listActiveSessions().filter((s) => s.userId === userId);
    return sessions.map((session) => ({
      id: session.id,
      sessionId: session.id,
      name: session.deviceName || "Remote Device",
      type: detectDeviceFormFactor(session.userAgent || ""),
      ipAddress: session.ipAddress || "127.0.0.1",
      userAgent: session.userAgent || "",
      lastActiveAt: session.createdAt,
      isCurrent: Boolean(currentSessionId && session.id === currentSessionId),
    }));
  }

  private toPayload(stored: StoredHandoff): HandoffPayload {
    return {
      id: stored.id,
      sourceDeviceId: stored.sourceDeviceId,
      sourceDeviceName: stored.sourceDeviceName,
      sourceDeviceType: stored.sourceDeviceType,
      targetDeviceId: stored.targetDeviceId,
      userId: stored.userId,
      layout: stored.layout,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
    };
  }
}

export const handoffService = new HandoffService();
