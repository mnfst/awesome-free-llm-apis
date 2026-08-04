import { describe, it, expect } from 'vitest';
import { parseDevToolsResult, evaluateStructured } from '../src/browser/DevToolsCall.js';
import { FakeDevToolsClient } from '../src/browser/DevToolsClient.js';

describe('parseDevToolsResult', () => {
    it('parses a ```json fenced markdown array (the shape smoke scripts regexed by hand)', () => {
        const raw = { content: [{ type: 'text', text: '```json\n[{"a":1}]\n```' }] };
        const res = parseDevToolsResult(raw);
        expect(res.ok).toBe(true);
        expect(res.json).toEqual([{ a: 1 }]);
    });

    it('unwraps a double-encoded JSON string', () => {
        const raw = { content: [{ type: 'text', text: '```json\n"[{\\"a\\":1}]"\n```' }] };
        const res = parseDevToolsResult(raw);
        expect(res.ok).toBe(true);
        expect(res.json).toEqual([{ a: 1 }]);
    });

    it('parses bare JSON with no fence', () => {
        const raw = { content: [{ type: 'text', text: '{"ok":true}' }] };
        const res = parseDevToolsResult(raw);
        expect(res.ok).toBe(true);
        expect(res.json).toEqual({ ok: true });
    });

    it('reports a structured failure instead of throwing on garbage input', () => {
        const raw = { content: [{ type: 'text', text: 'not json at all' }] };
        const res = parseDevToolsResult(raw);
        expect(res.ok).toBe(false);
        expect(res.error).toBeTruthy();
    });

    it('reports empty-response failure without throwing', () => {
        const res = parseDevToolsResult({ content: [] });
        expect(res.ok).toBe(false);
    });
});

describe('evaluateStructured', () => {
    it('returns typed data on success and never string-interpolates args into source', async () => {
        const client = new FakeDevToolsClient((req) => {
            // Simulate chrome-devtools-mcp executing the wrapped function.
            expect(req.name).toBe('evaluate_script');
            expect(req.arguments?.function).toContain('__bt');
            return { content: [{ type: 'text', text: JSON.stringify({ __bt: 1, ok: true, data: { echoed: req.arguments?.args?.[0] } }) }] };
        });

        const res = await evaluateStructured(client, `(a) => a`, { value: 'user-supplied<script>' });
        expect(res.ok).toBe(true);
        expect(res.json).toEqual({ echoed: { value: 'user-supplied<script>' } });
    });

    it('surfaces an in-page throw as a typed error instead of an empty catch', async () => {
        const client = new FakeDevToolsClient(() => ({
            content: [{ type: 'text', text: JSON.stringify({ __bt: 1, ok: false, error: 'boom' }) }],
        }));
        const res = await evaluateStructured(client, `() => { throw new Error('boom'); }`);
        expect(res.ok).toBe(false);
        expect(res.error).toBe('boom');
    });
});
