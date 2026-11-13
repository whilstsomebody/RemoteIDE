import { AuditRecord, AuditEventType, createId } from "@remote-ide/shared";

export class AuditService {
  private records: AuditRecord[] = [];
  private readonly maxRecords = 500;

  public record(
    eventType: AuditEventType,
    actorId: string,
    options: {
      targetId?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): AuditRecord {
    // Sanitize metadata to guarantee no credentials or raw tokens are recorded
    const sanitizedMetadata: Record<string, unknown> = {};
    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes("password") ||
          lowerKey.includes("token") ||
          lowerKey.includes("pin") ||
          lowerKey.includes("secret")
        ) {
          sanitizedMetadata[key] = "[REDACTED]";
        } else {
          sanitizedMetadata[key] = value;
        }
      }
    }

    const record: AuditRecord = {
      id: createId("audit"),
      eventType,
      actorId,
      targetId: options.targetId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      metadata: Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : undefined,
      timestamp: new Date().toISOString(),
    };

    this.records.unshift(record);
    if (this.records.length > this.maxRecords) {
      this.records.length = this.maxRecords;
    }

    return record;
  }

  public getRecent(limit = 100): AuditRecord[] {
    return this.records.slice(0, Math.min(limit, this.maxRecords));
  }

  public clear(): void {
    this.records = [];
  }
}

export const auditService = new AuditService();

