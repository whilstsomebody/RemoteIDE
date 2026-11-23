import { AppError } from "@remote-ide/shared";
import { ErrorCode } from "@remote-ide/shared";

export interface RateLimitRule {
  limit: number; // Maximum requests
  windowMs: number; // Time window in milliseconds
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimiterService {
  private inMemoryWindows = new Map<string, WindowEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  public readonly defaultRules = {
    auth: { limit: 15, windowMs: 60_000 }, // 15 attempts per minute
    api: { limit: 600, windowMs: 60_000 }, // 600 requests per minute
    websocket: { limit: 60, windowMs: 60_000 }, // 60 WS handshakes per minute
  };

  constructor() {
    // Periodic sweep of expired windows every 30s
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.inMemoryWindows) {
        if (entry.resetAt <= now) {
          this.inMemoryWindows.delete(key);
        }
      }
    }, 30_000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Checks and consumes a request under the rate limit bucket.
   */
  public checkLimit(identifier: string, rule: RateLimitRule): RateLimitResult {
    const now = Date.now();
    let entry = this.inMemoryWindows.get(identifier);

    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 1,
        resetAt: now + rule.windowMs,
      };
      this.inMemoryWindows.set(identifier, entry);
      return {
        allowed: true,
        limit: rule.limit,
        remaining: rule.limit - 1,
        resetMs: rule.windowMs,
      };
    }

    if (entry.count >= rule.limit) {
      return {
        allowed: false,
        limit: rule.limit,
        remaining: 0,
        resetMs: Math.max(0, entry.resetAt - now),
      };
    }

    entry.count++;
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit - entry.count,
      resetMs: Math.max(0, entry.resetAt - now),
    };
  }

  /**
   * Asserts rate limit, throwing HTTP 429 if exceeded.
   */
  public assertLimit(identifier: string, rule: RateLimitRule, operationName = "request"): void {
    const res = this.checkLimit(identifier, rule);
    if (!res.allowed) {
      const retryAfterSec = Math.ceil(res.resetMs / 1000);
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        `Too many ${operationName}s. Rate limit exceeded. Please retry in ${retryAfterSec}s.`,
        { statusCode: 429, details: [{ retryAfterSeconds: retryAfterSec }] }
      );
    }
  }

  public reset(identifier?: string): void {
    if (identifier) {
      this.inMemoryWindows.delete(identifier);
    } else {
      this.inMemoryWindows.clear();
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const rateLimiterService = new RateLimiterService();
