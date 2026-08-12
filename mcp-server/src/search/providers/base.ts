import type { SearchProvider, UnifiedSearchResult } from '../types.js';

/**
 * Mirrors BaseProvider's cooldown/backoff and isAvailable() conventions
 * (src/providers/base.ts) so SearchRouterMiddleware can reuse the same
 * circuit-breaker scoring TextRouterMiddleware already relies on.
 */
export abstract class BaseSearchProvider implements SearchProvider {
  abstract id: string;
  abstract name: string;
  envVar?: string;

  public consecutiveFailures = 0;
  protected cooldownUntil = 0;

  abstract search(query: string, maxResults?: number): Promise<UnifiedSearchResult[]>;

  isAvailable(): boolean {
    if (!this.envVar) return true; // keyless provider (Parallel AI, SearXNG w/ no auth)
    const key = process.env[this.envVar];
    if (!key || key.trim() === '') return false;
    const lowerKey = key.toLowerCase();
    const placeholders = ['your_', 'insert_', 'token_here', 'key_here', 'example'];
    if (placeholders.some(p => lowerKey.includes(p))) return false;
    if (key.trim().length < 10) return false;
    return true;
  }

  getPenaltyScore(): number {
    if (Date.now() < this.cooldownUntil) return 0.5;
    if (this.consecutiveFailures > 0) return Math.min(0.4, this.consecutiveFailures * 0.1);
    return 0;
  }

  recordFailure(status: number, retryAfterSeconds?: number): void {
    if (this.consecutiveFailures < 100) this.consecutiveFailures++;
    if (status === 429) {
      const cooldownMs = retryAfterSeconds ? retryAfterSeconds * 1000 : 60_000;
      this.cooldownUntil = Date.now() + cooldownMs;
    } else if (status >= 500) {
      const baseDelay = 10_000;
      const maxDelay = 60_000;
      const exponent = Math.min(this.consecutiveFailures - 1, 10);
      this.cooldownUntil = Date.now() + Math.min(baseDelay * Math.pow(2, exponent), maxDelay);
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.cooldownUntil = 0;
  }
}
