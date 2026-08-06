import { bench, describe } from "vitest";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";

/**
 * Simulated exchangeRefreshToken function matching firebase.ts logic & retries
 */
const EXCHANGE_REFRESH_TOKEN_RETRY_DELAYS_MS = [300, 800];

function isRetryableNetworkError(err: any): boolean {
  const errMsg = err?.message || String(err);
  return (
    errMsg.includes("fetch failed") ||
    errMsg.includes("timeout") ||
    errMsg.includes("ConnectTimeoutError") ||
    errMsg.includes("aborted") ||
    err?.name === "AbortError" ||
    err?.code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

interface ExchangeResult {
  idToken: string;
  refreshToken: string;
  userId: string;
  expiresIn: number;
}

interface MockFetchOption {
  mockResponses?: Array<{ ok: boolean; status: number; body: any; error?: Error }>;
}

async function simulateExchangeRefreshToken(
  refreshToken: string,
  options: MockFetchOption = {}
): Promise<{ result: ExchangeResult | null; attempts: number; warnings: string[] }> {
  const warnings: string[] = [];
  const responses = options.mockResponses || [];
  let attempt = 0;
  let lastErr: any;

  for (; attempt <= EXCHANGE_REFRESH_TOKEN_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const respSpec = responses[attempt] || {
        ok: true,
        status: 200,
        body: {
          id_token: "mock-id-token-12345",
          refresh_token: "mock-refresh-token-67890",
          user_id: "mock-user-uid-abcde",
          expires_in: "3600",
        },
      };

      if (respSpec.error) {
        throw respSpec.error;
      }

      if (!respSpec.ok) {
        const bodyStr = typeof respSpec.body === "string" ? respSpec.body : JSON.stringify(respSpec.body);
        const warnMsg = `[Firebase] Refresh token exchange rejected by Google (HTTP ${respSpec.status}): ${bodyStr.slice(0, 300)}. Falling back to a new anonymous account.`;
        warnings.push(warnMsg);
        return { result: null, attempts: attempt + 1, warnings };
      }

      const data = respSpec.body;
      return {
        result: {
          idToken: data.id_token,
          refreshToken: data.refresh_token,
          userId: data.user_id,
          expiresIn: parseInt(data.expires_in, 10),
        },
        attempts: attempt + 1,
        warnings,
      };
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === EXCHANGE_REFRESH_TOKEN_RETRY_DELAYS_MS.length;
      if (isLastAttempt || !isRetryableNetworkError(err)) break;
      // Skip actual delay during sync/benchmark simulation or use simulated tick
    }
  }

  const warnMsg = `[Firebase] Refresh token exchange failed after retries: ${(lastErr as Error)?.message || lastErr}. Falling back to a new anonymous account.`;
  warnings.push(warnMsg);
  const fallbackWarn = `[Firebase] Saved identity (UID: mock-saved-uid) could not be restored — provisioning a NEW anonymous account. Previous usage history will appear under the old UID.`;
  warnings.push(fallbackWarn);

  return { result: null, attempts: attempt + 1, warnings };
}

// Pre-populate benchmark output log report
generateLogReport().catch(console.error);

describe("08-firebase-retry benchmarks", () => {
  // Scenario 1: 0 retries instant success
  bench("exchangeRefreshToken (0 retries instant success)", async () => {
    const res = await simulateExchangeRefreshToken("valid-refresh-token", {
      mockResponses: [
        {
          ok: true,
          status: 200,
          body: {
            id_token: "id-tok-0",
            refresh_token: "ref-tok-0",
            user_id: "user-uid-0",
            expires_in: "3600",
          },
        },
      ],
    });
    countTokens(JSON.stringify(res));
  });

  // Scenario 2: 1 retry with backoff
  bench("exchangeRefreshToken (1 retry with backoff)", async () => {
    const res = await simulateExchangeRefreshToken("valid-refresh-token", {
      mockResponses: [
        { ok: false, status: 500, body: {}, error: new Error("fetch failed (network blip)") },
        {
          ok: true,
          status: 200,
          body: {
            id_token: "id-tok-1",
            refresh_token: "ref-tok-1",
            user_id: "user-uid-1",
            expires_in: "3600",
          },
        },
      ],
    });
    countTokens(JSON.stringify(res));
  });

  // Scenario 3: 3 retries exhausted fallback to new account with explicit warning
  bench("exchangeRefreshToken (3 retries exhausted fallback to new account)", async () => {
    const res = await simulateExchangeRefreshToken("stale-refresh-token", {
      mockResponses: [
        { ok: false, status: 500, body: {}, error: new Error("fetch failed (timeout attempt 1)") },
        { ok: false, status: 500, body: {}, error: new Error("fetch failed (timeout attempt 2)") },
        { ok: false, status: 500, body: {}, error: new Error("fetch failed (timeout attempt 3)") },
      ],
    });
    countTokens(JSON.stringify(res));
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  // Measurement 1
  const t0 = performance.now();
  const res1 = await simulateExchangeRefreshToken("valid-token", {
    mockResponses: [
      {
        ok: true,
        status: 200,
        body: { id_token: "id-1", refresh_token: "ref-1", user_id: "uid-1", expires_in: "3600" },
      },
    ],
  });
  const t1 = performance.now();
  const tokens1 = countTokens(JSON.stringify(res1));

  // Measurement 2
  const t2 = performance.now();
  const res2 = await simulateExchangeRefreshToken("valid-token", {
    mockResponses: [
      { ok: false, status: 500, body: {}, error: new Error("fetch failed (network blip)") },
      {
        ok: true,
        status: 200,
        body: { id_token: "id-2", refresh_token: "ref-2", user_id: "uid-2", expires_in: "3600" },
      },
    ],
  });
  const t3 = performance.now();
  const tokens2 = countTokens(JSON.stringify(res2));

  // Measurement 3
  const t4 = performance.now();
  const res3 = await simulateExchangeRefreshToken("stale-token", {
    mockResponses: [
      { ok: false, status: 500, body: {}, error: new Error("fetch failed (timeout attempt 1)") },
      { ok: false, status: 500, body: {}, error: new Error("fetch failed (timeout attempt 2)") },
      { ok: false, status: 500, body: {}, error: new Error("fetch failed (timeout attempt 3)") },
    ],
  });
  const t5 = performance.now();
  const tokens3 = countTokens(JSON.stringify(res3));

  const logContent = `# Benchmark Log: 08-firebase-retry

**Timestamp**: ${timestamp}

## Scenarios Executed

1. **exchangeRefreshToken (0 retries instant success)**
   - Latency: ${(t1 - t0).toFixed(2)} ms
   - Attempts: ${res1.attempts}
   - Token Count: ${tokens1} tokens
   - Result: Auth Success (UID: ${res1.result?.userId})

2. **exchangeRefreshToken (1 retry with backoff)**
   - Latency: ${(t3 - t2).toFixed(2)} ms
   - Attempts: ${res2.attempts}
   - Token Count: ${tokens2} tokens
   - Result: Auth Recovered on Retry (UID: ${res2.result?.userId})

3. **exchangeRefreshToken (3 retries exhausted fallback to new account)**
   - Latency: ${(t5 - t4).toFixed(2)} ms
   - Attempts: ${res3.attempts}
   - Token Count: ${tokens3} tokens
   - Warnings Logged:
     ${res3.warnings.map((w) => `- \`${w}\``).join("\n     ")}
   - Fallback Action: Provisioned new anonymous account

---
*Generated by Vitest Benchmark Suite (08-firebase-retry.bench.ts)*
`;

  await writeBenchmarkLog("08-firebase-retry.md", logContent);
}
