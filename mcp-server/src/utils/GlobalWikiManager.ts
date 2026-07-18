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
}
