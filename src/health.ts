// Running totals for the periodic health line — no sample arrays, just sums,
// min and max, reset after every summary.
export default class HealthSummary {
  private polls = 0;
  private failed = 0;
  private latencySum = 0;
  private latencyMax = 0;
  private minSignal?: number;
  private latestSignal?: number;
  private cycles?: string;
  private lastError?: string;
  private windowStart: number;

  constructor(private readonly now: () => number = Date.now) {
    this.windowStart = this.now();
  }

  recordSuccess = (latencyMs: number, signalDbm: number, cycles?: string) => {
    this.polls++;
    this.latencySum += latencyMs;
    this.latencyMax = Math.max(this.latencyMax, latencyMs);

    if (!Number.isNaN(signalDbm)) {
      this.minSignal = this.minSignal === undefined ? signalDbm : Math.min(this.minSignal, signalDbm);
      this.latestSignal = signalDbm;
    }
    this.cycles = cycles ?? this.cycles;
  };

  recordFailure = (message?: string) => {
    this.polls++;
    this.failed++;
    this.lastError = message ?? this.lastError;
  };

  // Returns the summary line for the window since the last call, or undefined
  // (leaving the window open) if there were no polls. Resets the counters.
  summarize = (): string | undefined => {
    if (this.polls === 0) {
      return undefined;
    }

    const ok = this.polls - this.failed;
    const minutes = Math.round((this.now() - this.windowStart) / 60000);
    const parts = [
      `Health (last ${minutes} min): polls ${ok} ok / ${this.failed} failed (${Math.round(100 * ok / this.polls)}% success)`,
    ];

    if (ok > 0) {
      parts.push(`latency avg ${Math.round(this.latencySum / ok)} ms, max ${Math.round(this.latencyMax)} ms`);
    }
    if (this.latestSignal !== undefined) {
      parts.push(`Wi-Fi min ${this.minSignal} dBm, latest ${this.latestSignal} dBm`);
    }
    if (this.cycles !== undefined) {
      parts.push(`cycles ${this.cycles}`);
    }
    if (this.lastError) {
      parts.push(`last error: ${this.lastError}`);
    }

    this.polls = 0;
    this.failed = 0;
    this.latencySum = 0;
    this.latencyMax = 0;
    this.minSignal = undefined;
    this.latestSignal = undefined;
    this.lastError = undefined;
    this.windowStart = this.now();

    return parts.join(', ');
  };
}
