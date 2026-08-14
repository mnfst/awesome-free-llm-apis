import { getBrowserSessionPool } from '../browser/BrowserSessionPool.js';
import { evaluateStructured } from '../browser/DevToolsCall.js';

const CDP_SOUP_MAX_CHARS = 12000;

/**
 * Fallback content extractor using chrome-devtools-mcp (via BrowserSessionPool).
 * Performs DOM evaluation (`document.body.innerText`) when provider-native
 * Phase 2 extraction is not available or fails.
 */
export async function cdpSoupExtract(url: string): Promise<string | undefined> {
  try {
    const pool = getBrowserSessionPool();
    const { session, error } = await pool.acquire('cdp-soup-session');
    if (!session) return undefined;

    try {
      await session.client.callTool({
        name: 'navigate_page',
        arguments: { url },
      });

      const res = await evaluateStructured(
        session.client,
        `() => {
          const text = document.body ? document.body.innerText : '';
          return text.replace(/\\n{3,}/g, '\\n\\n').trim();
        }`
      );

      if (res.ok && typeof res.json === 'string' && res.json.length > 50) {
        return res.json.slice(0, CDP_SOUP_MAX_CHARS);
      }
    } finally {
      await pool.release('cdp-soup-session');
    }
  } catch {
    // Fail-graceful: CDP soup extraction is strictly best-effort
  }
  return undefined;
}
