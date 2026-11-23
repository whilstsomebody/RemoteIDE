import { redisService } from "./redis.service.js";
import { kafkaService } from "./kafka.service.js";
import { tunnelRelayService } from "./tunnel-relay.service.js";
import { outboxService } from "./outbox.service.js";

export interface LatencyStats {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  count: number;
  avg: number;
}

export class TelemetryService {
  private requestCounts = new Map<string, number>(); // "METHOD:route:status" -> count
  private errorCounts = new Map<string, number>(); // code -> count
  private latencies: number[] = [];
  private readonly maxLatencySamples = 5000;

  public recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
    const key = `${method.toUpperCase()}:${route}:${status}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    if (this.latencies.length >= this.maxLatencySamples) {
      this.latencies.shift();
    }
    this.latencies.push(durationMs);
  }

  public recordError(code: string): void {
    this.errorCounts.set(code, (this.errorCounts.get(code) || 0) + 1);
  }

  public getLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, count: 0, avg: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const getPercentile = (p: number) => {
      const idx = Math.min(Math.floor((p / 100) * count), count - 1);
      return Math.round(sorted[idx]! * 100) / 100;
    };

    return {
      p50: getPercentile(50),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
      count,
      avg: Math.round((sum / count) * 100) / 100,
    };
  }

  public getMetricsSnapshot(): Record<string, unknown> {
    const redis = redisService.getMetrics();
    const kafka = kafkaService.getMetrics();
    const outbox = outboxService.getOutboxStats();
    const latency = this.getLatencyStats();
    const mem = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      service: "@remote-ide/gateway",
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024)),
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
      },
      http: {
        latencyMs: latency,
        requestsByRoute: Object.fromEntries(this.requestCounts),
        errorsByCode: Object.fromEntries(this.errorCounts),
      },
      websockets: {
        activeClients: tunnelRelayService.getClientSocketCount(),
      },
      hostAgent: {
        online: tunnelRelayService.isHostOnline(),
      },
      redis: {
        connected: redis.connected,
        cacheHits: redis.cacheHits,
        cacheMisses: redis.cacheMisses,
        hitRatio: redis.hitRatio,
      },
      kafka: {
        connected: kafka.connected,
        publishedCount: kafka.publishedCount,
        consumedCount: kafka.consumedCount,
        consumerLag: kafka.consumerLag,
      },
      outbox: {
        pendingCount: outbox.pendingCount,
        failedCount: outbox.failedCount,
      },
    };
  }

  public getPrometheusMetrics(): string {
    const latency = this.getLatencyStats();
    const redis = redisService.getMetrics();
    const kafka = kafkaService.getMetrics();
    const outbox = outboxService.getOutboxStats();
    const mem = process.memoryUsage();
    const lines: string[] = [];

    lines.push("# HELP remoteide_gateway_uptime_seconds RemoteIDE Gateway uptime in seconds.");
    lines.push("# TYPE remoteide_gateway_uptime_seconds gauge");
    lines.push(`remoteide_gateway_uptime_seconds ${Math.floor(process.uptime())}`);

    lines.push("# HELP remoteide_process_memory_heap_bytes Memory heap used in bytes.");
    lines.push("# TYPE remoteide_process_memory_heap_bytes gauge");
    lines.push(`remoteide_process_memory_heap_bytes ${mem.heapUsed}`);

    lines.push("# HELP remoteide_http_latency_ms HTTP request latency percentiles in ms.");
    lines.push("# TYPE remoteide_http_latency_ms gauge");
    lines.push(`remoteide_http_latency_ms{quantile="0.5"} ${latency.p50}`);
    lines.push(`remoteide_http_latency_ms{quantile="0.9"} ${latency.p90}`);
    lines.push(`remoteide_http_latency_ms{quantile="0.95"} ${latency.p95}`);
    lines.push(`remoteide_http_latency_ms{quantile="0.99"} ${latency.p99}`);

    lines.push("# HELP remoteide_ws_active_connections Number of active client WebSocket connections.");
    lines.push("# TYPE remoteide_ws_active_connections gauge");
    lines.push(`remoteide_ws_active_connections ${tunnelRelayService.getClientSocketCount()}`);

    lines.push("# HELP remoteide_host_agent_connected Whether the host agent reverse tunnel is active (1=online, 0=offline).");
    lines.push("# TYPE remoteide_host_agent_connected gauge");
    lines.push(`remoteide_host_agent_connected ${tunnelRelayService.isHostOnline() ? 1 : 0}`);

    lines.push("# HELP remoteide_redis_cache_hits_total Total Redis cache hit count.");
    lines.push("# TYPE remoteide_redis_cache_hits_total counter");
    lines.push(`remoteide_redis_cache_hits_total ${redis.cacheHits}`);

    lines.push("# HELP remoteide_redis_cache_misses_total Total Redis cache miss count.");
    lines.push("# TYPE remoteide_redis_cache_misses_total counter");
    lines.push(`remoteide_redis_cache_misses_total ${redis.cacheMisses}`);

    lines.push("# HELP remoteide_kafka_consumer_lag Kafka consumer lag.");
    lines.push("# TYPE remoteide_kafka_consumer_lag gauge");
    lines.push(`remoteide_kafka_consumer_lag ${kafka.consumerLag}`);

    lines.push("# HELP remoteide_outbox_pending_events Outbox events pending dispatch to Kafka.");
    lines.push("# TYPE remoteide_outbox_pending_events gauge");
    lines.push(`remoteide_outbox_pending_events ${outbox.pendingCount}`);

    for (const [key, count] of this.requestCounts) {
      const [method, route, status] = key.split(":");
      lines.push(`remoteide_http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
    }

    return lines.join("\n") + "\n";
  }
}

export const telemetryService = new TelemetryService();
