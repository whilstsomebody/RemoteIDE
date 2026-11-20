"use client";

export interface ReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
}

export class ConnectionRecoveryManager {
  private attempt = 0;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly backoffFactor: number;
  private readonly jitter: boolean;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: ReconnectOptions = {}) {
    this.initialDelayMs = options.initialDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 30000;
    this.backoffFactor = options.backoffFactor || 1.8;
    this.jitter = options.jitter ?? true;
  }

  public getNextDelay(): number {
    const rawDelay = Math.min(
      this.maxDelayMs,
      this.initialDelayMs * Math.pow(this.backoffFactor, this.attempt)
    );
    this.attempt++;

    if (!this.jitter) return Math.floor(rawDelay);

    // Jitter: +/- 20%
    const min = rawDelay * 0.8;
    const max = rawDelay * 1.2;
    return Math.floor(min + Math.random() * (max - min));
  }

  public scheduleReconnect(callback: () => void | Promise<void>): number {
    this.cancelScheduled();
    const delay = this.getNextDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void callback();
    }, delay);
    return delay;
  }

  public reset(): void {
    this.attempt = 0;
    this.cancelScheduled();
  }

  public cancelScheduled(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public getAttemptCount(): number {
    return this.attempt;
  }
}
