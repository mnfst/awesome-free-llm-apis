import { resolveFileRefs } from '../../src/tools/use-free-llm.js';
import { classifyIntent } from '../../src/pipeline/middlewares/intent-classifier.js';
import { protectInjectedReferenceBlocks } from '../../src/pipeline/middlewares/AgenticMiddleware.js';
import { getMessageContent } from '../../src/utils/MessageUtils.js';

async function main() {
    const PDF_PATH = 'docs/assets/day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf';
    const multiPageRefs = [1, 2, 3, 4, 5, 6].map(p => `pdf://${PDF_PATH}:${p}`).join(' ');
    const messages: any[] = [{ role: 'user', content: `${multiPageRefs} summarize each page in one sentence.` }];
    await resolveFileRefs(messages[0], messages, process.cwd());

    const raw = getMessageContent(messages[0].content);
    console.log('=== RAW length ===', raw.length);

    const { tokenized, placeholders } = protectInjectedReferenceBlocks(raw);
    console.log('=== TOKENIZED ===');
    console.log(JSON.stringify(tokenized));
    console.log('placeholders:', placeholders.size);

    console.log('=== classifyIntent(tokenized) ===', classifyIntent(tokenized));
}

main().catch(err => { console.error(err); process.exit(1); });
