import { pino, Logger } from "pino";
import {
  SyncEventsDto,
  SyncEventsResult,
  HostPendingEvent,
  WorkspaceEventType,
} from "@remote-ide/shared";
import { LocalJournalService } from "./local-journal.service.js";

export interface SyncClientOptions {
  gatewayHttpUrl?: string;
  hostId: string;
  journalService: LocalJournalService;
  logger?: Logger;
  syncIntervalMs?: number;
}

export class SyncClientService {
  private gatewayHttpUrl: string;
  private hostId: string;
  private journal: LocalJournalService;
  private logger: Logger;
  private syncIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private isRunning: boolean = false;

  constructor(options: SyncClientOptions) {
    this.gatewayHttpUrl = options.gatewayHttpUrl || "http://localhost:4000";
    this.hostId = options.hostId;
    this.journal = options.journalService;
    this.logger = options.logger || pino({ name: "sync-client" });
    this.syncIntervalMs = options.syncIntervalMs || 1000;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.timer = setInterval(async () => {
      await this.flushPendingEvents();
    }, this.syncIntervalMs);

    this.logger.info({ hostId: this.hostId }, "Agent sync client started");
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Flush pending entries from local SQLite journal to Gateway control plane.
   */
  public async flushPendingEvents(batchSize: number = 50): Promise<{
    syncedCount: number;
    duplicateCount: number;
  }> {
    if (this.isSyncing) return { syncedCount: 0, duplicateCount: 0 };
    this.isSyncing = true;

    try {
      const pending = this.journal.getPendingEntries(batchSize);
      if (pending.length === 0) {
        return { syncedCount: 0, duplicateCount: 0 };
      }

      const events: HostPendingEvent[] = pending.map((p) => {
        let type: string = WorkspaceEventType.FILE_UPDATED;
        if (p.operationType === "create") type = WorkspaceEventType.FILE_CREATED;
        else if (p.operationType === "delete") type = WorkspaceEventType.FILE_DELETED;

        return {
          eventId: p.eventId,
          sequenceNumber: p.sequenceNumber,
          workspaceId: p.workspaceId,
          type,
          operationType: p.operationType,
          relativePath: p.relativePath,
          fileVersion: p.fileVersion,
          payload: p.metadata || {},
          timestamp: p.timestamp,
        };
      });

      const dto: SyncEventsDto = {
        hostId: this.hostId,
        events,
      };

      const res = await fetch(`${this.gatewayHttpUrl}/api/v1/sync/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        this.logger.debug({ status: res.status }, "Gateway sync endpoint returned non-200");
        return { syncedCount: 0, duplicateCount: 0 };
      }

      const body = (await res.json()) as { success: boolean; data?: SyncEventsResult };
      if (body.success && body.data) {
        const acceptedSet = new Set(body.data.acceptedEventIds);
        const dupSet = new Set(body.data.duplicateEventIds);

        // Collect sequence numbers for accepted or duplicate events
        const sequenceNumbersToDeliver = pending
          .filter((p) => acceptedSet.has(p.eventId) || dupSet.has(p.eventId))
          .map((p) => p.sequenceNumber);

        this.journal.markDelivered(sequenceNumbersToDeliver);

        this.logger.info(
          {
            accepted: body.data.acceptedEventIds.length,
            duplicates: body.data.duplicateEventIds.length,
          },
          "Flushed local journal events to Gateway"
        );

        return {
          syncedCount: body.data.acceptedEventIds.length,
          duplicateCount: body.data.duplicateEventIds.length,
        };
      }

      return { syncedCount: 0, duplicateCount: 0 };
    } catch (err: unknown) {
      // Offline or network error - non fatal, will retry next interval
      this.logger.debug(
        { err: err instanceof Error ? err.message : String(err) },
        "Sync flush paused (gateway offline)"
      );
      return { syncedCount: 0, duplicateCount: 0 };
    } finally {
      this.isSyncing = false;
    }
  }
}
