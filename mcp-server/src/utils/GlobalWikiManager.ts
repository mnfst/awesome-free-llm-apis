import type { WikiMemory } from '../memory/wiki.js';

export class GlobalWikiManager {
  private static stats: Record<string, { successes: number; failures: number }> = {};

  static logSuccess(toolName: string): void {
    if (!this.stats[toolName]) {
      this.stats[toolName] = { successes: 0, failures: 0 };
    }
    this.stats[toolName].successes++;
  }

  static logFailure(toolName: string): void {
    if (!this.stats[toolName]) {
      this.stats[toolName] = { successes: 0, failures: 0 };
    }
    this.stats[toolName].failures++;
  }

  static getStats(): Record<string, { successes: number; failures: number }> {
    return { ...this.stats };
  }

  static reset(): void {
    this.stats = {};
  }

  /**
   * Persists the in-process success/failure counters (which reset on restart) into a
   * single durable wiki page, so tool-reliability trends survive across server restarts.
   */
  static async flushToWiki(wiki: WikiMemory): Promise<void> {
    const entries = Object.entries(this.stats);
    if (entries.length === 0) return;

    const lines = entries.map(([tool, { successes, failures }]) => {
      const total = successes + failures;
      const rate = total > 0 ? Math.round((successes / total) * 100) : 0;
      return `- **${tool}**: ${successes} success / ${failures} failure (${rate}% success rate)`;
    });
    const content = `## Tool Reliability\n\n${lines.join('\n')}`;

    await wiki.write('Tool Reliability', content, ['tool-stats']);
  }
}
