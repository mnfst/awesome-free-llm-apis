import { describe, it, expect } from 'vitest';
import { CoachTool } from '../src/tools/coach-tool.js';

describe('CoachTool', () => {
  it('explainInstruction generates a valid 4-phase explanation frame', () => {
    const coach = new CoachTool();
    const frame = coach.explainInstruction('Add input validation to user form');

    expect(frame.concept).toContain('Concept: Add input validation to user form');
    expect(frame.example).toContain('Example:');
    expect(frame.exercise).toContain('Exercise: Modify the target file');
    expect(frame.hint).toContain('Hint:');
  });

  it('reinforce generates a one-sentence reflection', () => {
    const coach = new CoachTool();
    coach.explainInstruction('Refactor math utility');
    const reflection = coach.reinforce('Refactor math utility', 'Added safeDivide null checks');

    expect(reflection).toBe("Applied 'Refactor math utility': Added safeDivide null checks");
    const history = coach.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].reflection).toBe(reflection);
  });

  it('parseFrame parses raw frame text correctly', () => {
    const rawText = `
Concept: Safe division guard
Example: if (b === 0) return 0;
Exercise: Update safeDivide function in math.ts
Hint: Check edge cases for negative numbers
    `;

    const parsed = CoachTool.parseFrame(rawText);
    expect(parsed.concept).toBe('Safe division guard');
    expect(parsed.example).toBe('if (b === 0) return 0;');
    expect(parsed.exercise).toBe('Update safeDivide function in math.ts');
    expect(parsed.hint).toBe('Check edge cases for negative numbers');
  });

  it('compressHistory compresses history to respect 800 token budget', () => {
    const coach = new CoachTool();
    // Add multiple large session entries to push token count high
    const largeText = 'A'.repeat(500);
    for (let i = 0; i < 15; i++) {
      coach.explainInstruction(`Instruction ${i}: ${largeText}`);
      coach.reinforce(`Instruction ${i}: ${largeText}`, `Patch summary ${i}: ${largeText}`);
    }

    expect(coach.getTotalTokens()).toBeLessThanOrEqual(800);
  });
});
