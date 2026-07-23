import path from 'path';
import { useFreeLLM } from '../../src/tools/use-free-llm.js';

const REPO_ROOT = path.resolve(process.cwd());
const PDF_PATH = 'docs/assets/day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf';
const multiPageRefs = [1, 2, 3, 4, 5, 6].map(p => `pdf://${PDF_PATH}:${p}`).join(' ');

async function main() {
    const result = await useFreeLLM({
        messages: [{ role: 'user', content: `${multiPageRefs} summarize each page in one sentence.` }],
        agentic: true,
        workspace_root: REPO_ROOT,
        sessionId: `debug-2b-${Date.now()}`,
    } as any);
    console.log('=== RESULT ===');
    console.log(JSON.stringify(result.choices?.[0]?.message?.content).slice(0, 500));
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
