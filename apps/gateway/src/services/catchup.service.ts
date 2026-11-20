import { pino, Logger } from "pino";
import { GatewayStateStore, gatewayStateStore } from "./state-store.js";
import { outboxService, OutboxService } from "./outbox.service.js";
import { EventCompactor } from "./event-compactor.js";
import {
  CatchupSummary,
  CatchupAckDto,
  CatchupAckResult,
  EventRetentionPolicy,
  RegisteredDevice,
  DeviceType,
  DevicePresenceDto,
  DevicePresenceState,
  FileDiffResult,
} from "@remote-ide/shared";

export interface ChangelogCursorRecord {
  deviceId: string;
  workspaceId: string;
  lastAcknowledgedRevision: number;
  lastAcknowledgedAt: string;
  lastDeliveryId?: string;
}

export interface ChangelogDeliveryRecord {
  id: string;
  deviceId: string;
  workspaceId: string;
  fromRevision: number;
  toRevision: number;
  eventCount: number;
  fileCount: number;
  summary: CatchupSummary;
  status: "delivered" | "acknowledged" | "expired";
  deliveredAt: string;
  acknowledgedAt?: string;
  expiresAt: string;
}

export interface EventRetentionConfigRecord {
  workspaceId: string;
  retentionDays: number;
  auditRetentionDays: number;
  oldestRetainedRevision: number;
  updatedAt: string;
}

export interface DevicePresenceRecord {
  deviceId: string;
  workspaceId?: string;
  state: DevicePresenceState;
  lastSeenAt: string;
}

export class CatchupService {
  private logger: Logger;
  private outbox: OutboxService;
  private stateStore?: GatewayStateStore;

  // Runtime indexes persisted in SQLite
  private devices = new Map<string, RegisteredDevice>(); // deviceId -> device
  private syncCursors = new Map<string, number>(); // `${deviceId}:${workspaceId}` -> rev
  private changelogCursors = new Map<string, ChangelogCursorRecord>(); // `${deviceId}:${workspaceId}` -> cursor
  private deliveries = new Map<string, ChangelogDeliveryRecord>(); // deliveryId -> record
  private retentionConfigs = new Map<string, EventRetentionConfigRecord>(); // workspaceId -> config
  private devicePresence = new Map<string, DevicePresenceRecord>(); // deviceId -> presence

  constructor(
    opts: {
      logger?: Logger;
      outbox?: OutboxService;
      stateStore?: GatewayStateStore;
    } = {}
  ) {
    this.logger = opts.logger || pino({ name: "catchup-service" });
    this.outbox = opts.outbox || outboxService;
    this.stateStore = opts.stateStore;

    const saved = this.stateStore?.read<{
      devices: [string, RegisteredDevice][];
      syncCursors: [string, number][];
      changelogCursors: [string, ChangelogCursorRecord][];
      deliveries: [string, ChangelogDeliveryRecord][];
      retentionConfigs: [string, EventRetentionConfigRecord][];
    }>("catchup");

    if (saved) {
      if (saved.devices) this.devices = new Map(saved.devices);
      if (saved.syncCursors) this.syncCursors = new Map(saved.syncCursors);
      if (saved.changelogCursors) this.changelogCursors = new Map(saved.changelogCursors);
      if (saved.deliveries) this.deliveries = new Map(saved.deliveries);
      if (saved.retentionConfigs) this.retentionConfigs = new Map(saved.retentionConfigs);
    }
  }

  private persist(): void {
    this.stateStore?.write("catchup", {
      devices: [...this.devices],
      syncCursors: [...this.syncCursors],
      changelogCursors: [...this.changelogCursors],
      deliveries: [...this.deliveries],
      retentionConfigs: [...this.retentionConfigs],
    });
  }

  // --- 1. Device Registration & Lifecycle ---

  public registerDevice(params: {
    deviceId: string;
    deviceName?: string;
    deviceType?: RegisteredDevice["deviceType"];
    userId: string;
    userAgent?: string;
    ipAddress?: string;
  }): RegisteredDevice {
    const now = new Date().toISOString();
    const existing = this.devices.get(params.deviceId);

    const device: RegisteredDevice = {
      id: params.deviceId,
      userId: params.userId,
      deviceName: params.deviceName || existing?.deviceName || "Remote Device",
      deviceType: params.deviceType || existing?.deviceType || DeviceType.BROWSER,
      userAgent: params.userAgent || existing?.userAgent,
      ipAddress: params.ipAddress || existing?.ipAddress,
      lastSeenAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.devices.set(params.deviceId, device);
    this.persist();
    return device;
  }

  public getDevice(deviceId: string): RegisteredDevice | undefined {
    return this.devices.get(deviceId);
  }

  public listDevicesForUser(userId: string): RegisteredDevice[] {
    return Array.from(this.devices.values()).filter((d) => d.userId === userId);
  }

  // --- 2. Inactivity Detection & Presence Tracking ---

  public recordPresence(dto: DevicePresenceDto): void {
    const now = new Date().toISOString();
    this.devicePresence.set(dto.deviceId, {
      deviceId: dto.deviceId,
      workspaceId: dto.workspaceId,
      state: dto.state,
      lastSeenAt: now,
    });

    const dev = this.devices.get(dto.deviceId);
    if (dev) {
      dev.lastSeenAt = now;
      dev.updatedAt = now;
      this.persist();
    }
  }

  public getDevicePresence(deviceId: string): DevicePresenceRecord | undefined {
    return this.devicePresence.get(deviceId);
  }

  // --- 3. Cursors (Sync vs Changelog Acknowledged) ---

  public updateSyncCursor(deviceId: string, workspaceId: string, revision: number): void {
    const key = `${deviceId}:${workspaceId}`;
    const current = this.syncCursors.get(key) || 0;
    if (revision > current) {
      this.syncCursors.set(key, revision);
      this.persist();
    }
  }

  public getSyncCursor(deviceId: string, workspaceId: string): number {
    return this.syncCursors.get(`${deviceId}:${workspaceId}`) || 0;
  }

  public updateChangelogCursor(deviceId: string, workspaceId: string, revision: number): void {
    const key = `${deviceId}:${workspaceId}`;
    const now = new Date().toISOString();
    this.changelogCursors.set(key, {
      deviceId,
      workspaceId,
      lastAcknowledgedRevision: revision,
      lastAcknowledgedAt: now,
    });
    this.persist();
  }

  public getChangelogCursor(deviceId: string, workspaceId: string): number {
    const record = this.changelogCursors.get(`${deviceId}:${workspaceId}`);
    return record?.lastAcknowledgedRevision || 0;
  }

  public getChangelogCursorRecord(
    deviceId: string,
    workspaceId: string
  ): ChangelogCursorRecord | undefined {
    return this.changelogCursors.get(`${deviceId}:${workspaceId}`);
  }

  // --- 4. Catch-Up Generation ---

  public generateCatchupSummary(params: {
    deviceId: string;
    workspaceId: string;
    workspaceName?: string;
    allowedPrefixes?: string[];
  }): CatchupSummary {
    const res = this.generateCatchup(params);
    if (!res) {
      const cur = this.outbox.getCurrentRevision(params.workspaceId);
      const ack = this.getChangelogCursor(params.deviceId, params.workspaceId);
      return {
        deliveryId: "del_noop",
        workspaceId: params.workspaceId,
        workspaceName: params.workspaceName,
        deviceId: params.deviceId,
        fromRevision: ack,
        toRevision: cur,
        timeWindow: {
          from: new Date().toISOString(),
          to: new Date().toISOString(),
        },
        totalEvents: 0,
        totalFilesAffected: 0,
        netChanges: {
          filesCreated: [],
          filesModified: [],
          filesRenamed: [],
          filesDeleted: [],
          gitChanges: [],
          jobs: [],
          processes: [],
          sessionEvents: [],
        },
        activityHistory: [],
        historyExpired: false,
        reconciliationRequired: false,
      };
    }
    return res;
  }

  public generateCatchup(params: {
    deviceId: string;
    workspaceId: string;
    workspaceName?: string;
    allowedPrefixes?: string[];
  }): CatchupSummary | null {
    const { deviceId, workspaceId, workspaceName, allowedPrefixes } = params;

    const lastAckRev = this.getChangelogCursor(deviceId, workspaceId);
    const currentRev = this.outbox.getCurrentRevision(workspaceId);
    const oldestRev = this.outbox.getOldestRevision(workspaceId);
    const policy = this.getRetentionPolicy(workspaceId);

    // Check if history is expired (revisions purged beyond retention window)
    const historyExpired = lastAckRev > 0 && oldestRev > 0 && lastAckRev < oldestRev;

    // Check if device is already completely caught up and up-to-date
    if (!historyExpired && lastAckRev >= currentRev && currentRev > 0) {
      return null;
    }

    if (!historyExpired && currentRev === 0) {
      return null;
    }

    // Determine target revision range
    const fromRev = historyExpired ? oldestRev : lastAckRev + 1;
    const toRev = currentRev;

    // Retrieve authorized events in the range
    const events = historyExpired ? [] : this.outbox.getEventsInRange(workspaceId, fromRev, toRev);

    // If there were no events between fromRev and toRev (e.g. revision gap or no recorded events)
    if (events.length === 0 && !historyExpired) {
      // Revisions advanced without new domain events (or empty range)
      if (fromRev > toRev) return null;
    }

    // Generate delivery ID
    const deliveryId =
      "cdel_" +
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));

    const summary = EventCompactor.compact({
      deliveryId,
      workspaceId,
      workspaceName: workspaceName || workspaceId,
      deviceId,
      fromRevision: fromRev,
      toRevision: toRev,
      events,
      allowedPrefixes,
      historyExpired,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + policy.retentionDays * 86400000).toISOString();

    // Persist delivery record with status "delivered"
    // "Do not delete delivery state before acknowledgement."
    this.deliveries.set(deliveryId, {
      id: deliveryId,
      deviceId,
      workspaceId,
      fromRevision: fromRev,
      toRevision: toRev,
      eventCount: summary.totalEvents,
      fileCount: summary.totalFilesAffected,
      summary,
      status: "delivered",
      deliveredAt: now.toISOString(),
      expiresAt,
    });

    this.persist();
    return summary;
  }

  // --- 5. Acknowledgement ---

  public acknowledgeChangelog(dto: CatchupAckDto): CatchupAckResult {
    return this.acknowledgeCatchup(dto);
  }

  public acknowledgeCatchup(dto: CatchupAckDto): CatchupAckResult {
    const { deliveryId, workspaceId, deviceId } = dto;
    const delivery = this.deliveries.get(deliveryId);
    const currentRev = this.outbox.getCurrentRevision(workspaceId);

    // If delivery is already acknowledged, handle idempotently
    if (delivery && delivery.status === "acknowledged") {
      return {
        acknowledged: true,
        success: true,
        deliveryId,
        acknowledgedRevision: delivery.toRevision,
        currentRevision: currentRev,
      } as any;
    }

    // If delivery not found, check if an existing cursor is already at or past this
    const key = `${deviceId}:${workspaceId}`;
    const existing = this.changelogCursors.get(key);

    if (!delivery) {
      // Unknown delivery; return current cursor status
      return {
        acknowledged: false,
        deliveryId,
        acknowledgedRevision: existing?.lastAcknowledgedRevision || 0,
        currentRevision: currentRev,
      };
    }

    // Security check: verify workspace and device match
    if (delivery.workspaceId !== workspaceId || delivery.deviceId !== deviceId) {
      this.logger.warn(
        { dto, delivery },
        "Catch-up acknowledgement mismatched device or workspace"
      );
      return {
        acknowledged: false,
        deliveryId,
        acknowledgedRevision: existing?.lastAcknowledgedRevision || 0,
        currentRevision: currentRev,
      };
    }

    const now = new Date().toISOString();

    // Transactionally advance cursor:
    // "Never mark revisions newer than the delivered summary as acknowledged."
    const priorAck = existing?.lastAcknowledgedRevision || 0;
    const newAck = Math.max(priorAck, delivery.toRevision);

    this.changelogCursors.set(key, {
      deviceId,
      workspaceId,
      lastAcknowledgedRevision: newAck,
      lastAcknowledgedAt: now,
      lastDeliveryId: deliveryId,
    });

    delivery.status = "acknowledged";
    delivery.acknowledgedAt = now;

    this.persist();

    return {
      acknowledged: true,
      success: true,
      deliveryId,
      acknowledgedRevision: newAck,
      currentRevision: currentRev,
    } as any;
  }

  public getDelivery(deliveryId: string): ChangelogDeliveryRecord | undefined {
    return this.deliveries.get(deliveryId);
  }

  // --- 6. File Diff Inspection ---

  public async getFileDiff(params: {
    workspaceId: string;
    path: string;
    fromRevision?: number;
    toRevision?: number;
  }): Promise<FileDiffResult> {
    const { workspaceId, path: rawPath, fromRevision, toRevision } = params;
    const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");

    // Path traversal security check
    if (normalized.includes("../") || normalized.startsWith("../")) {
      throw new Error("Invalid or forbidden file path");
    }

    // In single-gateway / dev environment, query recent events for content snapshots or diffs
    const events = this.outbox.getEventsInRange(
      workspaceId,
      fromRevision || 0,
      toRevision || 9999999
    );

    let originalContent = "";
    let currentContent = "";

    for (const ev of events) {
      const p = (ev.payload || {}) as Record<string, any>;
      const evPath = (p.relativePath || p.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
      if (evPath === normalized) {
        if (!originalContent && p.content) {
          originalContent = p.content;
        }
        if (p.content) {
          currentContent = p.content;
        }
      }
    }

    // Simple line diff hunk generator
    const origLines = originalContent.split("\n");
    const currLines = currentContent.split("\n");
    const diffHunks: string[] = [];

    let lineNum = 1;
    const maxLines = Math.max(origLines.length, currLines.length);
    for (let i = 0; i < maxLines; i++) {
      const o = origLines[i];
      const c = currLines[i];
      if (o !== c) {
        if (o !== undefined) diffHunks.push(`-${lineNum}: ${o}`);
        if (c !== undefined) diffHunks.push(`+${lineNum}: ${c}`);
      }
      lineNum++;
    }

    return {
      path: normalized,
      workspaceId,
      fromRevision,
      toRevision,
      originalContent,
      currentContent,
      diffHunks,
      isBinary: false,
    };
  }

  // --- 7. Configurable Retention & Pruning ---

  public getRetentionPolicy(workspaceId: string): EventRetentionPolicy {
    const existing = this.retentionConfigs.get(workspaceId);
    return {
      workspaceId,
      retentionDays: existing?.retentionDays || 7,
      auditRetentionDays: existing?.auditRetentionDays || 90,
      oldestRetainedRevision: existing?.oldestRetainedRevision || 0,
      updatedAt: existing?.updatedAt || new Date().toISOString(),
    };
  }

  public setRetentionPolicy(workspaceId: string, retention: number | string): EventRetentionPolicy {
    let retentionDays: number;
    if (typeof retention === "string") {
      const lower = retention.toLowerCase().trim();
      if (lower === "24h" || lower === "1d" || lower === "1") retentionDays = 1;
      else if (lower === "3d" || lower === "3") retentionDays = 3;
      else if (lower === "7d" || lower === "7") retentionDays = 7;
      else if (lower === "30d" || lower === "30") retentionDays = 30;
      else retentionDays = parseInt(retention, 10);
    } else {
      retentionDays = retention;
    }

    const allowed = [1, 3, 7, 30];
    if (!allowed.includes(retentionDays)) {
      throw new Error("Retention days must be 1, 3, 7, or 30");
    }

    const now = new Date().toISOString();
    const config: EventRetentionConfigRecord = {
      workspaceId,
      retentionDays,
      auditRetentionDays: 90,
      oldestRetainedRevision: this.outbox.getOldestRevision(workspaceId),
      updatedAt: now,
    };

    this.retentionConfigs.set(workspaceId, config);
    this.persist();

    return {
      ...config,
    };
  }

  /**
   * Prunes expired deliveries and workspace events while respecting active device cursors.
   * Security audit records are never pruned by this routine.
   */
  public pruneExpiredEvents(workspaceId?: string) {
    return this.pruneExpiredData(workspaceId);
  }

  public pruneExpiredData(workspaceId?: string): {
    prunedDeliveriesCount: number;
    prunedEventsCount: number;
  } {
    const now = new Date().toISOString();
    let prunedDeliveriesCount = 0;
    let prunedEventsCount = 0;

    // 1. Prune expired deliveries
    for (const [id, del] of this.deliveries.entries()) {
      if (workspaceId && del.workspaceId !== workspaceId) continue;
      if (del.expiresAt < now || (del.status === "acknowledged" && del.expiresAt < now)) {
        this.deliveries.delete(id);
        prunedDeliveriesCount++;
      }
    }

    // 2. Prune events older than workspace retention policy
    const workspacesToPrune = workspaceId
      ? [workspaceId]
      : Array.from(new Set(Array.from(this.retentionConfigs.keys())));

    for (const wsId of workspacesToPrune) {
      const policy = this.getRetentionPolicy(wsId);
      const cutoffDate = new Date(Date.now() - policy.retentionDays * 86400000).toISOString();

      // Find the lowest active device cursor to avoid pruning active readers if possible
      let minActiveCursor = Infinity;
      for (const [key, cursor] of this.changelogCursors.entries()) {
        if (key.endsWith(`:${wsId}`)) {
          minActiveCursor = Math.min(minActiveCursor, cursor.lastAcknowledgedRevision);
        }
      }

      const res = this.outbox.pruneWorkspaceEventsOlderThan(wsId, cutoffDate);
      prunedEventsCount += res.prunedCount;

      const conf = this.retentionConfigs.get(wsId);
      if (conf) {
        conf.oldestRetainedRevision = res.oldestRemainingRevision;
        conf.updatedAt = now;
      }
    }

    if (prunedDeliveriesCount > 0 || prunedEventsCount > 0) {
      this.persist();
    }

    return { prunedDeliveriesCount, prunedEventsCount };
  }
}

export const catchupService = new CatchupService({
  stateStore: gatewayStateStore,
});
