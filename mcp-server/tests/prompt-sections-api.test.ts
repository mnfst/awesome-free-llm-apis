import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('GET /api/prompt_sections API helper & prompt.json verification', () => {
  it('should load prompt.json and verify sections with keywords', async () => {
    const promptJsonPath = path.resolve('../external/agent-prompt/prompt.json');
    const content = await fs.readFile(promptJsonPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed).toHaveProperty('sections');
    expect(Array.isArray(parsed.sections)).toBe(true);
    expect(parsed.sections.length).toBeGreaterThan(0);

    const firstSection = parsed.sections[0];
    expect(firstSection).toHaveProperty('id');
    expect(firstSection).toHaveProperty('title');
    expect(firstSection).toHaveProperty('content');
    expect(firstSection).toHaveProperty('keywords');
    expect(Array.isArray(firstSection.keywords)).toBe(true);
  });
});
