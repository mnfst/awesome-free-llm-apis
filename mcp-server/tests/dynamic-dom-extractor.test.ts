import { describe, it, expect } from 'vitest';
import { DynamicDomExtractor } from '../src/utils/DynamicDomExtractor.js';

describe('DynamicDomExtractor', () => {
    it('generates browser-executable script strings for SofaScore dynamic DOM parsing', () => {
        const script = DynamicDomExtractor.buildSofaScoreExtractionScript('football');
        expect(typeof script).toBe('string');
        expect(script).toContain('document.querySelectorAll');
        expect(script).toContain('data-id');
        expect(script).toContain('football');
    });
});
