const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  failures: number;
  windowStart: number;
  lockedUntil: number;
}

// Counts failed logins per key (an IP or a username). After too many failures, the key is locked for a while.
export class LoginLimiter {
  private entries = new Map<string, Entry>();
  private maxFailures: number;

  constructor(maxFailures: number) {
    this.maxFailures = maxFailures;
  }

  // Returns seconds to wait, or 0 if the key may try now
  check(key: string): number {
    const e = this.entries.get(key);
    const now = Date.now();
    if (!e || e.lockedUntil <= now) return 0;
    return Math.ceil((e.lockedUntil - now) / 1000);
  }

  fail(key: string): void {
    const now = Date.now();
    const e = this.entries.get(key);
    if (!e || now - e.windowStart > WINDOW_MS) {
      this.entries.set(key, { failures: 1, windowStart: now, lockedUntil: 0 });
      return;
    }
    e.failures += 1;
    if (e.failures >= this.maxFailures) {
      e.lockedUntil = now + LOCK_MS;
      e.failures = 0;
      e.windowStart = now;
    }
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}
