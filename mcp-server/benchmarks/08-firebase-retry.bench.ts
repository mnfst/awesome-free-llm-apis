import { bench, describe, afterAll, vi } from "vitest";
import { useCacheIsolation } from "../tests/helpers/test-cache-isolation.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";
import { exchangeRefreshToken, isRetryableNetworkError } from "../src/utils/firebase.js";

useCacheIsolation();

describe("08-firebase-retry benchmarks (Production exchangeRefreshToken Integration)", () => {
  afterAll(async () => {
    await generateLogReport();
  });

  // Scenario 1: 0 retries instant success
  bench("exchangeRefreshToken (0 retries instant success)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id_token: "id-tok-0",
        refresh_token: "ref-tok-0",
        user_id: "user-uid-0",
        expires_in: "3600",
      }),
    } as any);

    try {
      const res = await exchangeRefreshToken("valid-refresh-token");
      countTokens(JSON.stringify(res));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Scenario 2: 1 retry with backoff
  bench("exchangeRefreshToken (1 retry with backoff)", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("fetch failed (network blip)");
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id_token: "id-tok-1",
          refresh_token: "ref-tok-1",
          user_id: "user-uid-1",
          expires_in: "3600",
        }),
      } as any;
    });

    try {
      const res = await exchangeRefreshToken("valid-refresh-token");
      countTokens(JSON.stringify(res));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Scenario 3: 3 retries exhausted fallback
  bench("exchangeRefreshToken (3 retries exhausted fallback to new account)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      throw new Error("fetch failed (timeout)");
    });

    try {
      const res = await exchangeRefreshToken("stale-refresh-token");
      countTokens(JSON.stringify({ res, isNull: res === null }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Scenario 4: Error Classifier
  bench("isRetryableNetworkError classification", () => {
    const e1 = isRetryableNetworkError(new Error("fetch failed"));
    const e2 = isRetryableNetworkError(new Error("connect timeout"));
    const e3 = isRetryableNetworkError(new Error("unrelated application error"));
    countTokens(JSON.stringify({ e1, e2, e3 }));
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  const mcpToolInputPayload = {
    method: "exchangeRefreshToken",
    refreshToken: "valid-token-sample",
    maxRetries: 3
  };

  // Scenario 1 Measurement
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      id_token: "id-tok-0",
      refresh_token: "ref-tok-0",
      user_id: "user-uid-0",
      expires_in: "3600",
    }),
  } as any);

  const t0 = performance.now();
  const res1 = await exchangeRefreshToken("valid-token");
  const t1 = performance.now();

  // Scenario 2 Measurement
  let callCount = 0;
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      throw new Error("fetch failed (network blip)");
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id_token: "id-tok-1",
        refresh_token: "ref-tok-1",
        user_id: "user-uid-1",
        expires_in: "3600",
      }),
    } as any;
  });

  const t2 = performance.now();
  const res2 = await exchangeRefreshToken("valid-token");
  const t3 = performance.now();

  // Scenario 3 Measurement
  globalThis.fetch = vi.fn().mockImplementation(async () => {
    throw new Error("fetch failed (timeout)");
  });

  const t4 = performance.now();
  const res3 = await exchangeRefreshToken("stale-token");
  const t5 = performance.now();

  // Restore fetch
  globalThis.fetch = originalFetch;

  const tok1 = countTokens(JSON.stringify(res1));
  const tok2 = countTokens(JSON.stringify(res2));
  const tok3 = countTokens(JSON.stringify({ res3, isNull: res3 === null }));

  const logContent = `# Benchmark Log: 08-firebase-retry — Production exchangeRefreshToken Integration

**Timestamp**: ${timestamp}

## 📥 1. Internal Auth Refresh Input Payload
\`\`\`json
${JSON.stringify(mcpToolInputPayload, null, 2)}
\`\`\`

---

## 🎯 2. Production Code Executed & Telemetry
- **Source File**: \`src/utils/firebase.ts\`
- **Target Method**: \`export async function exchangeRefreshToken(refreshToken: string)\`
- **Network Classifier**: \`export function isRetryableNetworkError(err: any)\`

---

## ⚡ Real Implementation Scenarios Executed

### 1. **Instant Token Refresh Success (0 Retries)**
- **Latency**: ${(t1 - t0).toFixed(2)} ms
- **Token Count**: ${tok1} tokens
- **Output Payload**:
\`\`\`json
${JSON.stringify(res1, null, 2)}
\`\`\`

---

### 2. **Transient Network Error Recovery (1 Retry with Exponential Backoff)**
- **Latency**: ${(t3 - t2).toFixed(2)} ms
- **Token Count**: ${tok2} tokens
- **Output Payload**:
\`\`\`json
${JSON.stringify(res2, null, 2)}
\`\`\`

---

### 3. **Exhausted Network Retries Fallback (3 Retries Failed)**
- **Latency**: ${(t5 - t4).toFixed(2)} ms
- **Token Count**: ${tok3} tokens
- **Return Value**: \`null\` (Triggers provision of NEW anonymous account in \`initFirebase()\`)

---
*Generated by Vitest Benchmark Suite (08-firebase-retry.bench.ts)*
`;

  await writeBenchmarkLog("08-firebase-retry.md", logContent);
}
