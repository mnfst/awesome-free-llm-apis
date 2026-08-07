import { bench, describe } from "vitest";
import {
  parseSnapshot,
  diffSnapshots,
  summarizeDiff,
  looksLikeStructuralInterstitial,
} from "../src/browser/SnapshotDiffer.js";
import { detectBlockingChallenge } from "../src/browser/BlockDetector.js";
import { countTokens } from "./helpers/token-counter.js";
import { writeBenchmarkLog } from "./helpers/log-writer.js";
import fetch from "node-fetch";

// Sample snapshot fixtures
const prevExpandSnapshot = `
uid=root role=main "Main Dashboard"
  uid=nav role=navigation "Navigation Bar"
    uid=link-1 role=link "Home"
    uid=link-2 role=link "Dashboard"
  uid=sec-1 role=section "Settings Panel"
    uid=btn-expand role=button "Expand Advanced Options"
`;

// 22 child nodes expanded under "Expand Advanced Options"
const expandedNodesText = Array.from({ length: 22 }, (_, i) => {
  return `      uid=opt-${i + 1} role=checkbox "Option ${i + 1} Setting Configuration"`;
}).join("\n");

const currExpandSnapshot = `${prevExpandSnapshot}\n${expandedNodesText}`;

// DOM Stable snapshots
const domStablePrev = `
uid=root role=main "Application Main"
  uid=header role=banner "Header"
  uid=list role=list "Item List"
    uid=item-1 role=listitem "Item 1"
    uid=item-2 role=listitem "Item 2"
`;

const domStableCurr = `
uid=root role=main "Application Main"
  uid=header role=banner "Header"
  uid=list role=list "Item List"
    uid=item-1 role=listitem "Item 1"
    uid=item-2 role=listitem "Item 2"
`;

// Cloudflare structural wipeout snapshots
const prevNormalPage = `
uid=header role=banner "Site Header"
uid=nav role=navigation "Nav Menu"
uid=content role=main "Main Content Area"
uid=article-1 role=article "Article Entry 1"
uid=article-2 role=article "Article Entry 2"
uid=article-3 role=article "Article Entry 3"
uid=sidebar role=complementary "Sidebar Links"
uid=footer role=contentinfo "Footer Info"
uid=ads role=aside "Sponsors Section"
uid=widgets role=section "Widgets Container"
`;

const currCloudflareWipeout = `
uid=cf-box role=dialog "Just a moment..."
  uid=cf-txt role=text "Checking your browser before accessing example.com"
`;

generateLogReport().catch(console.error);

describe("07-browser-snapshot-diff benchmarks", () => {
  // Scenario 1: click -> expand structural node diff (+22 nodes)
  bench("click -> expand structural node diff (+22 nodes)", () => {
    const prevNodes = parseSnapshot(prevExpandSnapshot);
    const currNodes = parseSnapshot(currExpandSnapshot);
    const diff = diffSnapshots(prevNodes, currNodes);
    const summary = summarizeDiff(diff);
    countTokens(summary);
  });

  // Scenario 2: wait until:dom-stable single-diff exit
  bench("wait until:dom-stable single-diff exit", () => {
    const prevNodes = parseSnapshot(domStablePrev);
    const currNodes = parseSnapshot(domStableCurr);
    const diff = diffSnapshots(prevNodes, currNodes);
    const summary = summarizeDiff(diff);
    const isStable = diff.added.length === 0 && diff.removed.length === 0;
    JSON.stringify({ summary, isStable });
  });

  // Scenario 3: BlockDetector Cloudflare structural wipeout signal
  bench("BlockDetector Cloudflare structural wipeout signal", () => {
    const prevNodes = parseSnapshot(prevNormalPage);
    const currNodes = parseSnapshot(currCloudflareWipeout);
    const diff = diffSnapshots(prevNodes, currNodes);
    const structuralSignal = looksLikeStructuralInterstitial(prevNodes, diff);
    const detectionResult = detectBlockingChallenge(currCloudflareWipeout, structuralSignal);
    countTokens(JSON.stringify(detectionResult));
  });

  // Scenario 4: Live HTTP Scrape Snapshot Diff (http://localhost:3000 or fallback)
  bench("Live Scrape Snapshot Diff (localhost:3000 or fallback)", async () => {
    let snapshotText = '';
    try {
      const res = await fetch('http://localhost:3000', { timeout: 1000 } as any);
      if (!res.ok) throw new Error('Not OK');
      const html = await res.text();
      snapshotText = html.slice(0, 500);
    } catch {
      snapshotText = '[CHROME_DEVTOOLS_OFFLINE] uid=root role=main "Local Dashboard"';
    }
    const nodes = parseSnapshot(snapshotText);
    countTokens(JSON.stringify(nodes));
  });
});

async function generateLogReport() {
  const timestamp = new Date().toISOString();

  // Scenario 1 Measurement
  const t0 = performance.now();
  const prevExpandNodes = parseSnapshot(prevExpandSnapshot);
  const currExpandNodes = parseSnapshot(currExpandSnapshot);
  const expandDiff = diffSnapshots(prevExpandNodes, currExpandNodes);
  const expandSummary = summarizeDiff(expandDiff);
  const t1 = performance.now();
  const expandSummaryTokens = countTokens(expandSummary);

  // Scenario 2 Measurement
  const t2 = performance.now();
  const domPrevNodes = parseSnapshot(domStablePrev);
  const domCurrNodes = parseSnapshot(domStableCurr);
  const domDiff = diffSnapshots(domPrevNodes, domCurrNodes);
  const domSummary = summarizeDiff(domDiff);
  const isDomStable = domDiff.added.length === 0 && domDiff.removed.length === 0;
  const t3 = performance.now();

  // Scenario 3 Measurement
  const t4 = performance.now();
  const cfPrevNodes = parseSnapshot(prevNormalPage);
  const cfCurrNodes = parseSnapshot(currCloudflareWipeout);
  const cfDiff = diffSnapshots(cfPrevNodes, cfCurrNodes);
  const structuralSignal = looksLikeStructuralInterstitial(cfPrevNodes, cfDiff);
  const cfDetection = detectBlockingChallenge(currCloudflareWipeout, structuralSignal);
  const t5 = performance.now();
  const cfDetectionTokens = countTokens(JSON.stringify(cfDetection));

  // Scenario 4 Live Scrape
  let liveStatus = 'LIVE_HTTP_SUCCESS';
  let liveSnapshot = '';
  try {
    const res = await fetch('http://localhost:3000', { timeout: 1000 } as any);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    liveSnapshot = await res.text();
  } catch {
    liveStatus = '[CHROME_DEVTOOLS_OFFLINE]';
    liveSnapshot = `uid=root role=main "Dashboard Localhost:3000"\n  uid=header role=banner "Header"\n  uid=nav role=navigation "Navigation"`;
  }
  const liveNodes = parseSnapshot(liveSnapshot);

  const logContent = `# Benchmark Log: 07-browser-snapshot-diff

**Timestamp**: ${timestamp}

## 🎯 Target Page & Scrape Context
- **Live Scrape Target**: \`http://localhost:3000\`
- **Scrape Status**: \`${liveStatus}\`
- **Parsed Nodes Count**: ${liveNodes.length} nodes

---

## ⚡ Browser Snapshot & Interstitial Diff Breakdown

| Scenario | Latency | Key Metric | Tokens / Summary |
|---|---|---|---|
| **1. Click -> Expand (+22 nodes)** | ${(t1 - t0).toFixed(2)} ms | Added ${expandDiff.added.length} nodes | **${expandSummaryTokens} tokens** ("${expandSummary}") |
| **2. DOM-Stable Exit** | ${(t3 - t2).toFixed(2)} ms | Stable Signal Exit: \`${isDomStable}\` | Added: ${domDiff.added.length}, Removed: ${domDiff.removed.length} |
| **3. Cloudflare Structural Wipeout** | ${(t5 - t4).toFixed(2)} ms | Structural Signal: \`${structuralSignal}\` | **${cfDetectionTokens} tokens** (Blocked: \`${cfDetection.blocked}\`) |
| **4. Live Scrape (localhost:3000)** | — | Status: \`${liveStatus}\` | Parsed ${liveNodes.length} snapshot nodes |

---

## 📄 Scenario 1: Expand Diff Summary
\`\`\`text
${expandSummary}
\`\`\`

---

## 🛡️ Scenario 3: Cloudflare Detection Output
\`\`\`json
${JSON.stringify(cfDetection, null, 2)}
\`\`\`

---
*Generated by Vitest Benchmark Suite (07-browser-snapshot-diff.bench.ts)*
`;

  await writeBenchmarkLog("07-browser-snapshot-diff.md", logContent);
}
