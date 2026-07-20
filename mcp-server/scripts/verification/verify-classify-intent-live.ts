import { resolveFileRefs } from '../../src/tools/use-free-llm.js';
import { classifyIntent } from '../../src/pipeline/middlewares/intent-classifier.js';
import { protectInjectedReferenceBlocks } from '../../src/pipeline/middlewares/AgenticMiddleware.js';
import { getMessageContent } from '../../src/utils/MessageUtils.js';

async function main() {
    const messages: any[] = [{
        role: 'user',
        content: `[notes](pdf://docs/assets/day3_sttp_on_Ethical_Hacking_and_Cyber_Forensics.pdf:1) summarize this page in one sentence.`
    }];
    await resolveFileRefs(messages[0], messages, process.cwd());

    const raw = getMessageContent(messages[0].content);
    console.log('=== RAW resolved message content ===');
    console.log(JSON.stringify(raw));
    console.log('\nlength:', raw.length);

    console.log('\n=== classifyIntent(raw) ===', classifyIntent(raw));

    const { tokenized, placeholders } = protectInjectedReferenceBlocks(raw);
    console.log('\n=== tokenized ===');
    console.log(JSON.stringify(tokenized));
    console.log('placeholders:', placeholders.size);

    console.log('\n=== classifyIntent(tokenized) ===', classifyIntent(tokenized));
}

main().catch(err => { console.error(err); process.exit(1); });
