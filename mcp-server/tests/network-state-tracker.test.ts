import { describe, it, expect } from 'vitest';
import { ContextSanitizer, NetworkStateTracker } from '../src/utils/NetworkStateTracker.js';

describe('NetworkStateTracker & ContextSanitizer Tests', () => {
    it('surgically sanitizes long string values like JWTs and cookies to prevent context bloat', () => {
        const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        const sanitized = ContextSanitizer.sanitizeString(longToken, 25);

        expect(sanitized.length).toBeLessThan(longToken.length);
        expect(sanitized).toContain('...[len:');
        expect(sanitized.startsWith('eyJhbGciOiJIUzI')).toBe(true);
    });

    it('summarizes raw multi-kilobyte JSON network payloads into compact metadata descriptions', () => {
        const jsonPayload = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Match ${i}`, score: '2-1' })));
        const summary = ContextSanitizer.summarizeNetworkJsonPayload('https://api.sofascore.com/v1/events', jsonPayload);

        expect(summary).toContain('JSON Array [50 items]');
        expect(summary.length).toBeLessThan(120); // Compact summary length
    });

    it('tracks surgical cookie deltas between page actions', () => {
        const tracker = new NetworkStateTracker();

        // Initial pass
        const pass1 = [{ name: 'sess_id', value: 'secret_value_1234567890_abcdef', domain: 'sofascore.com' }];
        const deltas1 = tracker.computeCookieDeltas(pass1);

        expect(deltas1).toHaveLength(1);
        expect(deltas1[0].valuePreview).toContain('...[len:');

        // Second pass: no cookie changes
        const deltas2 = tracker.computeCookieDeltas(pass1);
        expect(deltas2).toHaveLength(0); // 0 token overhead when no changes occur!

        // Third pass: cookie value modified
        const pass3 = [{ name: 'sess_id', value: 'secret_value_9999999999_updated', domain: 'sofascore.com' }];
        const deltas3 = tracker.computeCookieDeltas(pass3);
        expect(deltas3).toHaveLength(1);
        expect(deltas3[0].changed).toBe(true);
    });
});
