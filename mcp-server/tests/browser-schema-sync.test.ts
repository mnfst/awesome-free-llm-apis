import { describe, it, expect } from 'vitest';
import { actionEnum, renderActionDocs, parseInput, BrowserActions } from '../src/browser/actionSchemas.js';

describe('browser_tool action schema registry', () => {
    it('actionEnum() lists every key of BrowserActions — the MCP schema is generated from this, not hand-written', () => {
        expect(actionEnum().sort()).toEqual(Object.keys(BrowserActions).sort());
    });

    it('renderActionDocs() produces a bounded, one-line-per-action description', () => {
        const docs = renderActionDocs();
        expect(docs.length).toBeLessThan(1400);
        for (const action of actionEnum()) {
            expect(docs).toContain(`${action}:`);
        }
    });

    it('parseInput validates action-specific params against the matching zod schema', () => {
        const parsed = parseInput({ action: 'click', params: { by: 'label', value: 'Lineups' } });
        expect(parsed.action).toBe('click');
        expect(parsed.params).toEqual({ by: 'label', value: 'Lineups' });
    });

    it('rejects an unknown action', () => {
        expect(() => parseInput({ action: 'not_a_real_action' })).toThrow();
    });

    it('rejects a click missing its required "by" field', () => {
        expect(() => parseInput({ action: 'click', params: { value: 'x' } })).toThrow();
    });
});
