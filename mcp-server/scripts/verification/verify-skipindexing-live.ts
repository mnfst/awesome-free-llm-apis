/**
 * Live demonstration (Phase 3): multi-page pdf:// capping (max 5 pages/pass) and the
 * CONFUSED->QUESTION routing upgrade, across agentic true/false and skipIndexing.
 * Run with: npx tsx --env-file=.env <this file>
 */
import path from 'path';
import { useFreeLLM } from '../../src/tools/use-free-llm.js';

const REPO_ROOT = path.resolve(process.cwd());
const PDF_PATH = 'docs/assets/day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf';
const singlePageRef = `[notes](pdf://${PDF_PATH}:1)`;
const multiPageRefs = [1, 2, 3, 4, 5, 6].map(p => `pdf://${PDF_PATH}:${p}`).join(' ');

function withCapturedLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
    const logs: string[] = [];
    const origError = console.error;
    const origDebug = console.debug;
    console.error = (...args: any[]) => { logs.push('[error] ' + args.join(' ')); };
    console.debug = (...args: any[]) => { logs.push('[debug] ' + args.join(' ')); };
    return fn().then(result => {
        console.error = origError;
        console.debug = origDebug;
        return { result, logs };
    }).catch(err => {
        console.error = origError;
        console.debug = origDebug;
        throw err;
    });
}

function summarizeIndexingLogs(logs: string[]): { indexing: boolean; pdfPageCap: boolean; deferredCount: number } {
    const deferredCount = logs.filter(l => l.includes('PDF page cap reached')).length;
    return {
        indexing: logs.some(l => l.includes('Pre-emptive indexing') || l.includes('Rebuilt repository dependency graph')),
        pdfPageCap: deferredCount > 0,
        deferredCount,
    };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function scenario(name: string, params: Parameters<typeof useFreeLLM>[0]) {
    console.log(`\n=== ${name} ===`);
    const start = Date.now();
    const { result, logs } = await withCapturedLogs(() => useFreeLLM(params));
    const elapsed = Date.now() - start;
    const flags = summarizeIndexingLogs(logs);
    const content = result.choices?.[0]?.message?.content;
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    console.log(`  elapsed: ${elapsed}ms`);
    console.log(`  background codebase re-index observed: ${flags.indexing}`);
    console.log(`  pdf page cap triggered: ${flags.pdfPageCap} (deferred markers: ${flags.deferredCount})`);
    console.log(`  looks like a clarifying question (bad): ${/i need a bit more detail/i.test(contentStr)}`);
    console.log(`  response preview: ${contentStr.replace(/\n/g, ' ')}...`);
    return { elapsed, flags, contentStr };
}

async function main() {
    // 1. Single page, agentic:false — baseline, should still just work (real summary).
    await scenario('1. Single-page, agentic:false', {
        messages: [{ role: 'user', content: `${singlePageRef} summarize this page in one sentence.` }],
    } as any);
    await sleep(5000);

    // 1b. Multi-page (6 refs > cap of 5), agentic:false — proves the cap alone, independent
    //     of agentic routing: exactly 5 resolve, the 6th is deferred with a sentinel, and the
    //     model shouldn't hallucinate content for the deferred page.
    await scenario('1b. Multi-page (6 refs), agentic:false', {
        messages: [{ role: 'user', content: `${multiPageRefs} summarize each page in one sentence.` }],
    } as any);
    await sleep(5000);

    // 2. Single page, agentic:true, skipIndexing unset — proves the CONFUSED->QUESTION
    //    upgrade: should return a real summary (not "I need a bit more detail"), and the
    //    background codebase re-index should still fire.
    await scenario('2. Single-page, agentic:true, skipIndexing unset', {
        messages: [{ role: 'user', content: `${singlePageRef} summarize this page in one sentence.` }],
        agentic: true,
        workspace_root: REPO_ROOT,
    } as any);
    await sleep(8000);

    // 3. Single page, agentic:true, skipIndexing:true — same routing fix, but confirms
    //    skipIndexing still independently gates only the codebase re-index pass.
    await scenario('3. Single-page, agentic:true, skipIndexing:true', {
        messages: [{ role: 'user', content: `${singlePageRef} summarize this page in one sentence.` }],
        agentic: true,
        workspace_root: REPO_ROOT,
        skipIndexing: true,
    } as any);
    await sleep(5000);

    // 2b. Multi-page (6 refs), agentic:true, skipIndexing unset — the combined case: cap +
    //     routing fix + background indexing all together, wall-clock bounded by the cap.
    await scenario('2b. Multi-page (6 refs), agentic:true, skipIndexing unset', {
        messages: [{ role: 'user', content: `${multiPageRefs} summarize each page in one sentence.` }],
        agentic: true,
        workspace_root: REPO_ROOT,
    } as any);

    console.log('\nDone.');
}

main().catch(err => {
    console.error('FATAL', err);
    process.exit(1);
});
