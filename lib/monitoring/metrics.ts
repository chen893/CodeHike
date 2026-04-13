/**
 * Simple timing and counting utilities for monitoring.
 * These are lightweight helpers that can be used in services for performance tracking.
 */

interface TimerResult {
  durationMs: number;
  label: string;
}

/**
 * Create a timer that measures elapsed time.
 */
export function startTimer(label: string): () => TimerResult {
  const start = performance.now();
  return () => {
    const durationMs = Math.round(performance.now() - start);
    return { durationMs, label };
  };
}

/**
 * Simple counter map for tracking event counts.
 */
export class EventCounter {
  private counts = new Map<string, number>();

  increment(event: string, amount = 1): void {
    this.counts.set(event, (this.counts.get(event) || 0) + amount);
  }

  get(event: string): number {
    return this.counts.get(event) || 0;
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.counts) {
      result[key] = value;
    }
    return result;
  }

  reset(): void {
    this.counts.clear();
  }
}

/**
 * Log a timing result to console (can be replaced with external monitoring).
 */
export function logTiming(result: TimerResult): void {
  console.log(`[timing] ${result.label}: ${result.durationMs}ms`);
}
