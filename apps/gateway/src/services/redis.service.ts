import { Redis } from "ioredis";
import { pino, Logger } from "pino";
import { REDIS_NAMESPACES, REDIS_TTL, RemoteSession } from "@remote-ide/shared";

export interface RedisServiceOptions {
  redisUrl?: string;
  logger?: Logger;
  lazyConnect?: boolean;
  enableFallback?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  remaining: number;
  resetSeconds: number;
}

export class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private logger: Logger;
  private isConnected: boolean = false;
  private enableFallback: boolean;

  // In-memory fallback cache for resilience during Redis outages or test environments
  private memoryCache = new Map<string, { value: string; expiresAt: number }>();
  private localPubSub = new Map<string, Set<(message: string) => void>>();

  // Metrics
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(options: RedisServiceOptions = {}) {
    this.logger = options.logger || pino({ name: "redis-service" });
    this.enableFallback = options.enableFallback ?? true;

    const redisUrl = options.redisUrl || process.env.REDIS_URL || "redis://localhost:6379";

    try {
      this.client = new Redis(redisUrl, {
        lazyConnect: options.lazyConnect ?? true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          // stop retrying and fall back to memory
          if (times > 3) return null;
          return Math.min(times * 100, 1000);
        },
        enableOfflineQueue: false,
      });

      this.subscriber = new Redis(redisUrl, {
        lazyConnect: options.lazyConnect ?? true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 1000);
        },
        enableOfflineQueue: false,
      });

      this.client.on("connect", () => {
        this.isConnected = true;
        this.logger.info("Connected to Redis server");
      });

      this.client.on("error", (err) => {
        this.isConnected = false;
        this.logger.warn(
          { err: err.message },
          "Redis client connection error (using memory fallback)"
        );
      });

      this.subscriber.on("error", (err) => {
        this.logger.warn({ err: err.message }, "Redis subscriber error (using memory fallback)");
      });
    } catch (err: unknown) {
      this.logger.warn({ err }, "Failed to initialize ioredis client (falling back to memory)");
      this.client = null;
      this.subscriber = null;
    }
  }

  public async connect(): Promise<void> {
    if (this.client && this.client.status === "wait") {
      try {
        await Promise.all([this.client.connect(), this.subscriber?.connect()]);
        this.isConnected = true;
      } catch (err) {
        this.isConnected = false;
        this.logger.warn("Could not connect to Redis server, operating in resilient fallback mode");
      }
    }
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  // Session Caching

  public async cacheSession(
    session: RemoteSession,
    ttlSeconds = REDIS_TTL.SESSION_SECONDS
  ): Promise<void> {
    const key = `${REDIS_NAMESPACES.SESSION}:${session.id}`;
    const value = JSON.stringify(session);

    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, value, "EX", ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn({ err }, "Redis set session error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  public async getCachedSession(sessionId: string): Promise<RemoteSession | null> {
    const key = `${REDIS_NAMESPACES.SESSION}:${sessionId}`;

    if (this.isConnected && this.client) {
      try {
        const data = await this.client.get(key);
        if (data) {
          this.metrics.cacheHits++;
          return JSON.parse(data) as RemoteSession;
        }
      } catch (err) {
        this.logger.warn({ err }, "Redis get session error");
      }
    }

    if (this.enableFallback) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        this.metrics.cacheHits++;
        return JSON.parse(entry.value) as RemoteSession;
      }
      this.memoryCache.delete(key);
    }

    this.metrics.cacheMisses++;
    return null;
  }

  public async invalidateSession(sessionId: string): Promise<void> {
    const key = `${REDIS_NAMESPACES.SESSION}:${sessionId}`;
    const permKey = `${REDIS_NAMESPACES.PERMISSIONS}:${sessionId}`;
    const routeKey = `${REDIS_NAMESPACES.ROUTING_SESSION}:${sessionId}`;

    if (this.isConnected && this.client) {
      try {
        await this.client.del(key, permKey, routeKey);
      } catch (err) {
        this.logger.warn({ err }, "Redis delete session error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.delete(key);
      this.memoryCache.delete(permKey);
      this.memoryCache.delete(routeKey);
    }
  }

  // Presence & Heartbeats

  public async setPresence(
    entityType: "host" | "device",
    id: string,
    metadata: Record<string, unknown> = {},
    ttlSeconds = REDIS_TTL.PRESENCE_SECONDS
  ): Promise<void> {
    const namespace =
      entityType === "host" ? REDIS_NAMESPACES.PRESENCE_HOST : REDIS_NAMESPACES.PRESENCE_DEVICE;
    const key = `${namespace}:${id}`;
    const value = JSON.stringify({
      id,
      entityType,
      lastHeartbeatAt: new Date().toISOString(),
      metadata,
    });

    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, value, "EX", ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn({ err }, "Redis set presence error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  public async getPresence(
    entityType: "host" | "device",
    id: string
  ): Promise<{ id: string; lastHeartbeatAt: string; metadata: Record<string, unknown> } | null> {
    const namespace =
      entityType === "host" ? REDIS_NAMESPACES.PRESENCE_HOST : REDIS_NAMESPACES.PRESENCE_DEVICE;
    const key = `${namespace}:${id}`;

    if (this.isConnected && this.client) {
      try {
        const data = await this.client.get(key);
        if (data) return JSON.parse(data);
      } catch (err) {
        this.logger.warn({ err }, "Redis get presence error");
      }
    }

    if (this.enableFallback) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        return JSON.parse(entry.value);
      }
      this.memoryCache.delete(key);
    }

    return null;
  }

  // Connection-to-Gateway Routing

  public async setRouting(
    entityType: "session" | "host",
    id: string,
    gatewayId: string,
    ttlSeconds = REDIS_TTL.ROUTING_SECONDS
  ): Promise<void> {
    const namespace =
      entityType === "session" ? REDIS_NAMESPACES.ROUTING_SESSION : REDIS_NAMESPACES.ROUTING_HOST;
    const key = `${namespace}:${id}`;

    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, gatewayId, "EX", ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn({ err }, "Redis set routing error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.set(key, { value: gatewayId, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  public async getRouting(entityType: "session" | "host", id: string): Promise<string | null> {
    const namespace =
      entityType === "session" ? REDIS_NAMESPACES.ROUTING_SESSION : REDIS_NAMESPACES.ROUTING_HOST;
    const key = `${namespace}:${id}`;

    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch (err) {
        this.logger.warn({ err }, "Redis get routing error");
      }
    }

    if (this.enableFallback) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.value;
      this.memoryCache.delete(key);
    }

    return null;
  }

  // Workspace Revision Caching

  public async cacheWorkspaceRevision(workspaceId: string, revision: number): Promise<void> {
    const key = `${REDIS_NAMESPACES.WORKSPACE_REVISION}:${workspaceId}`;
    const value = revision.toString();

    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, value, "EX", REDIS_TTL.WORKSPACE_REVISION_SECONDS);
        return;
      } catch (err) {
        this.logger.warn({ err }, "Redis cache workspace revision error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.set(key, {
        value,
        expiresAt: Date.now() + REDIS_TTL.WORKSPACE_REVISION_SECONDS * 1000,
      });
    }
  }

  public async getCachedWorkspaceRevision(workspaceId: string): Promise<number | null> {
    const key = `${REDIS_NAMESPACES.WORKSPACE_REVISION}:${workspaceId}`;

    if (this.isConnected && this.client) {
      try {
        const val = await this.client.get(key);
        if (val !== null) {
          this.metrics.cacheHits++;
          return parseInt(val, 10);
        }
      } catch (err) {
        this.logger.warn({ err }, "Redis get workspace revision error");
      }
    }

    if (this.enableFallback) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        this.metrics.cacheHits++;
        return parseInt(entry.value, 10);
      }
      this.memoryCache.delete(key);
    }

    this.metrics.cacheMisses++;
    return null;
  }

  // Permission Caching & Immediate Invalidation

  public async cachePermissions(
    sessionId: string,
    permissions: string[],
    ttlSeconds = REDIS_TTL.PERMISSIONS_SECONDS
  ): Promise<void> {
    const key = `${REDIS_NAMESPACES.PERMISSIONS}:${sessionId}`;
    const value = JSON.stringify(permissions);

    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, value, "EX", ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn({ err }, "Redis cache permissions error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  public async getCachedPermissions(sessionId: string): Promise<string[] | null> {
    const key = `${REDIS_NAMESPACES.PERMISSIONS}:${sessionId}`;

    if (this.isConnected && this.client) {
      try {
        const data = await this.client.get(key);
        if (data) {
          this.metrics.cacheHits++;
          return JSON.parse(data) as string[];
        }
      } catch (err) {
        this.logger.warn({ err }, "Redis get permissions error");
      }
    }

    if (this.enableFallback) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        this.metrics.cacheHits++;
        return JSON.parse(entry.value) as string[];
      }
      this.memoryCache.delete(key);
    }

    this.metrics.cacheMisses++;
    return null;
  }

  public async invalidatePermissions(sessionId: string): Promise<void> {
    const key = `${REDIS_NAMESPACES.PERMISSIONS}:${sessionId}`;

    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch (err) {
        this.logger.warn({ err }, "Redis invalidate permissions error");
      }
    }

    if (this.enableFallback) {
      this.memoryCache.delete(key);
    }
  }

  // Rate Limiting (Fixed Window Atomic Counter)

  public async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds = REDIS_TTL.RATE_LIMIT_SECONDS
  ): Promise<RateLimitResult> {
    const rateLimitKey = `${REDIS_NAMESPACES.RATE_LIMIT}:${key}`;

    if (this.isConnected && this.client) {
      try {
        const count = await this.client.incr(rateLimitKey);
        if (count === 1) {
          await this.client.expire(rateLimitKey, windowSeconds);
        }
        const ttl = await this.client.ttl(rateLimitKey);

        return {
          allowed: count <= limit,
          current: count,
          remaining: Math.max(0, limit - count),
          resetSeconds: ttl > 0 ? ttl : windowSeconds,
        };
      } catch (err) {
        this.logger.warn({ err }, "Redis rate limit error");
      }
    }

    // In-memory fallback
    const entry = this.memoryCache.get(rateLimitKey);
    const now = Date.now();
    let current = 1;
    let resetSeconds: number = windowSeconds;

    if (entry && entry.expiresAt > now) {
      current = parseInt(entry.value, 10) + 1;
      resetSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
      this.memoryCache.set(rateLimitKey, {
        value: current.toString(),
        expiresAt: entry.expiresAt,
      });
    } else {
      this.memoryCache.set(rateLimitKey, {
        value: "1",
        expiresAt: now + windowSeconds * 1000,
      });
    }

    return {
      allowed: current <= limit,
      current,
      remaining: Math.max(0, limit - current),
      resetSeconds,
    };
  }

  // Idempotency Key Caching

  /**
   * Checks and acquires an idempotency key.
   * Returns true if key was set (first time), false if already exists (duplicate).
   */
  public async acquireIdempotencyKey(
    key: string,
    ttlSeconds = REDIS_TTL.IDEMPOTENCY_SECONDS
  ): Promise<boolean> {
    const idempotencyKey = `${REDIS_NAMESPACES.IDEMPOTENCY}:${key}`;

    if (this.isConnected && this.client) {
      try {
        const res = await this.client.set(idempotencyKey, "1", "EX", ttlSeconds, "NX");
        return res === "OK";
      } catch (err) {
        this.logger.warn({ err }, "Redis idempotency check error");
      }
    }

    if (this.enableFallback) {
      const entry = this.memoryCache.get(idempotencyKey);
      if (entry && entry.expiresAt > Date.now()) {
        return false;
      }
      this.memoryCache.set(idempotencyKey, {
        value: "1",
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return true;
    }

    return true;
  }

  // Pub/Sub Fan-Out

  public async publish(channel: string, message: unknown): Promise<number> {
    const msgString = typeof message === "string" ? message : JSON.stringify(message);

    let deliveredCount = 0;
    if (this.isConnected && this.client) {
      try {
        deliveredCount = await this.client.publish(channel, msgString);
      } catch (err) {
        this.logger.warn({ err }, "Redis publish error");
      }
    }

    // Also trigger in-memory subscribers for same-instance / fallback delivery
    const handlers = this.localPubSub.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(msgString);
          deliveredCount++;
        } catch (err) {
          this.logger.error({ err }, "Error in local subscriber handler");
        }
      }
    }

    return deliveredCount;
  }

  public async subscribe(channel: string, handler: (message: string) => void): Promise<() => void> {
    // Add to local handlers
    let handlers = this.localPubSub.get(channel);
    if (!handlers) {
      handlers = new Set();
      this.localPubSub.set(channel, handlers);
    }
    handlers.add(handler);

    if (this.isConnected && this.subscriber) {
      try {
        await this.subscriber.subscribe(channel);
        this.subscriber.on("message", (ch, msg) => {
          if (ch === channel) {
            handler(msg);
          }
        });
      } catch (err) {
        this.logger.warn({ err }, "Redis subscribe error");
      }
    }

    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.localPubSub.delete(channel);
        if (this.isConnected && this.subscriber) {
          this.subscriber.unsubscribe(channel).catch(() => {});
        }
      }
    };
  }

  // Metrics & Lifecycle

  public getMetrics(): {
    cacheHits: number;
    cacheMisses: number;
    hitRatio: number;
    connected: boolean;
  } {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRatio = total > 0 ? Number((this.metrics.cacheHits / total).toFixed(4)) : 1.0;
    return {
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      hitRatio,
      connected: this.isConnected,
    };
  }

  public async close(): Promise<void> {
    this.isConnected = false;
    this.memoryCache.clear();
    this.localPubSub.clear();

    if (this.client) {
      try {
        await this.client.quit();
      } catch {}
      this.client = null;
    }
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {}
      this.subscriber = null;
    }
  }
}

export const redisService = new RedisService({ lazyConnect: true });
