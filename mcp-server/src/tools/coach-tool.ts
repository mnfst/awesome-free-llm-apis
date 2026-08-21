import { countStringTokens } from '../utils/tiktoken.js';

export interface CoachExplanationFrame {
  concept: string;
  example: string;
  exercise: string;
  hint: string;
}

export interface CoachSessionEntry {
  instruction: string;
  explanation?: CoachExplanationFrame;
  patchSummary?: string;
  reflection?: string;
  timestamp: number;
}

export class CoachTool {
  private history: CoachSessionEntry[] = [];
  private static readonly MAX_TOKEN_BUDGET = 800;

  constructor(initialHistory: CoachSessionEntry[] = []) {
    this.history = [...initialHistory];
    this.compressHistory();
  }

  /**
   * Formats instruction into Phase 1 Coach Frame (concept, example, exercise, hint)
   */
  public explainInstruction(instruction: string): CoachExplanationFrame {
    const concept = `Concept: ${instruction.trim()}`;
    const example = `Example: Illustrative code pattern or minimal snippet implementing '${instruction.trim()}'`;
    const exercise = `Exercise: Modify the target file according to '${instruction.trim()}'`;
    const hint = `Hint: Ensure changes are scoped precisely and existing tests pass.`;

    const frame: CoachExplanationFrame = {
      concept,
      example,
      exercise,
      hint,
    };

    this.history.push({
      instruction,
      explanation: frame,
      timestamp: Date.now(),
    });

    this.compressHistory();
    return frame;
  }

  /**
   * Generates Phase 4 one-sentence reflection after patch completion
   */
  public reinforce(instruction: string, patchSummary: string): string {
    const reflection = `Applied '${instruction.trim()}': ${patchSummary.trim()}`;

    // Find recent entry or create one
    const existing = [...this.history].reverse().find(e => e.instruction === instruction);
    if (existing) {
      existing.patchSummary = patchSummary;
      existing.reflection = reflection;
    } else {
      this.history.push({
        instruction,
        patchSummary,
        reflection,
        timestamp: Date.now(),
      });
    }

    this.compressHistory();
    return reflection;
  }

  /**
   * Parses raw model text or structured text into CoachExplanationFrame
   */
  public static parseFrame(text: string): CoachExplanationFrame {
    const conceptMatch = text.match(/Concept:\s*([\s\S]*?)(?=(Example:|Exercise:|Hint:|$))/i);
    const exampleMatch = text.match(/Example:\s*([\s\S]*?)(?=(Concept:|Exercise:|Hint:|$))/i);
    const exerciseMatch = text.match(/Exercise:\s*([\s\S]*?)(?=(Concept:|Example:|Hint:|$))/i);
    const hintMatch = text.match(/Hint:\s*([\s\S]*?)(?=(Concept:|Example:|Exercise:|$))/i);

    return {
      concept: conceptMatch ? conceptMatch[1].trim() : text.trim(),
      example: exampleMatch ? exampleMatch[1].trim() : '',
      exercise: exerciseMatch ? exerciseMatch[1].trim() : '',
      hint: hintMatch ? hintMatch[1].trim() : '',
    };
  }

  /**
   * Compresses session history to stay strictly within 800 tokens budget.
   * Retains newest entries in full and prunes/summarizes older entries.
   */
  public compressHistory(): void {
    let totalTokens = this.calculateHistoryTokens();
    
    while (totalTokens > CoachTool.MAX_TOKEN_BUDGET && this.history.length > 1) {
      // Prune oldest entry explanation/details first, or shift oldest item off
      const oldest = this.history[0];
      if (oldest.explanation) {
        delete oldest.explanation;
      } else {
        this.history.shift();
      }
      totalTokens = this.calculateHistoryTokens();
    }

    if (totalTokens > CoachTool.MAX_TOKEN_BUDGET && this.history.length === 1) {
      const single = this.history[0];
      if (single.explanation) {
        delete single.explanation;
      }
      totalTokens = this.calculateHistoryTokens();
      while (totalTokens > CoachTool.MAX_TOKEN_BUDGET && single.instruction.length > 50) {
        single.instruction = single.instruction.slice(0, Math.floor(single.instruction.length * 0.7)) + '... [truncated]';
        totalTokens = this.calculateHistoryTokens();
      }
    }
  }

  public getHistory(): readonly CoachSessionEntry[] {
    return this.history;
  }

  public getTotalTokens(): number {
    return this.calculateHistoryTokens();
  }

  private calculateHistoryTokens(): number {
    const text = JSON.stringify(this.history);
    return countStringTokens(text);
  }
}
