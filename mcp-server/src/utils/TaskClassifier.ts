import type { Message } from '../providers/types.js';
import { TaskType } from '../pipeline/middleware.js';
import { getMessageContent } from './MessageUtils.js';

export class TaskClassifier {
    private static readonly keywordTaskMap: Record<string, TaskType> = {
        'code': TaskType.Coding, 'coding': TaskType.Coding, 'debug': TaskType.Coding, 'implement': TaskType.Coding,
        'function': TaskType.Coding, 'class': TaskType.Coding, 'typescript': TaskType.Coding, 'javascript': TaskType.Coding,
        'python': TaskType.Coding, 'rust': TaskType.Coding, 'go': TaskType.Coding, 'fix': TaskType.Coding, 'refactor': TaskType.Coding,
        'summary': TaskType.Summarization, 'summarize': TaskType.Summarization, 'tldr': TaskType.Summarization,
        'tl;dr': TaskType.Summarization, 'concise': TaskType.Summarization, 'brief': TaskType.Summarization,
        'extract': TaskType.EntityExtraction, 'extraction': TaskType.EntityExtraction, 'entities': TaskType.EntityExtraction,
        'json': TaskType.EntityExtraction, 'fields': TaskType.EntityExtraction, 'parse': TaskType.EntityExtraction,
        'classify': TaskType.Classification, 'classification': TaskType.Classification, 'sentiment': TaskType.Classification,
        'categorize': TaskType.Classification, 'label': TaskType.Classification,
        'search': TaskType.SemanticSearch, 'find': TaskType.SemanticSearch, 'lookup': TaskType.SemanticSearch,
        'research': TaskType.SemanticSearch, 'discover': TaskType.SemanticSearch, 'knowledge': TaskType.SemanticSearch,
        'moderate': TaskType.Moderation, 'moderation': TaskType.Moderation, 'safety': TaskType.Moderation,
        'filter': TaskType.Moderation, 'policy': TaskType.Moderation,
        'think': TaskType.Reasoning, 'thinking': TaskType.Reasoning, 'reason': TaskType.Reasoning,
        'logic': TaskType.Reasoning, 'proof': TaskType.Reasoning, 'math': TaskType.Reasoning,
        'cyber': TaskType.Cyber, 'exploit': TaskType.Cyber, 'vulnerability': TaskType.Cyber, 'pentest': TaskType.Cyber,
        'pwn': TaskType.Cyber, 'cve': TaskType.Cyber, 'malware': TaskType.Cyber, 'fuzzing': TaskType.Cyber,
        'ctf': TaskType.Cyber, 'phishing': TaskType.Cyber, 'soc': TaskType.Cyber, 'sast': TaskType.Cyber,
    };

    public static autoClassify(messages: Message[], explicitKeywords?: string[]): TaskType {
        for (const msg of messages) {
            if (Array.isArray(msg.content)) {
                if (msg.content.some((item: any) => item && typeof item === 'object' && item.type === 'image_url')) {
                    return TaskType.Vision;
                }
            }
        }

        if (explicitKeywords && explicitKeywords.length > 0) {
            const counts: Record<string, number> = {};
            for (const kw of explicitKeywords) {
                const type = TaskClassifier.keywordTaskMap[kw.toLowerCase()];
                if (type) {
                    counts[type] = (counts[type] || 0) + 1;
                }
            }

            const winners = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (winners.length > 0) {
                if (winners.length === 1 || winners[0][1] > winners[1][1]) {
                    return winners[0][0] as TaskType;
                }
            }
        }

        const rawLastMsg = getMessageContent(messages[messages.length - 1]);
        const lastMsg = TaskClassifier.getOriginalUserContent(rawLastMsg).toLowerCase();

        const cyberTerms = /\b(ctf|exploit|pentest|pwn|cve|fuzzing|reverse-engineering|buffer-overflow|binary-analysis|wireshark|metasploit|port-scan|nmap|malware|phishing|secure-coding|owasp|sast|dast)\b/i;
        if (cyberTerms.test(lastMsg)) {
            return TaskType.Cyber;
        }

        if (/\b(classify|sentiment|categorize)\b/i.test(lastMsg)) {
            return TaskType.Classification;
        }
        if (/\b(moderate|safety|policy|violation)\b/i.test(lastMsg)) {
            return TaskType.Moderation;
        }
        if (/\b(summarize|summarization|tldr|tl;dr|concise)\b/i.test(lastMsg)) {
            return TaskType.Summarization;
        }
        if (/\b(extract|entities|json|fields)\b/i.test(lastMsg)) {
            return TaskType.EntityExtraction;
        }
        if (/\b(search|find|lookup)\b/i.test(lastMsg)) {
            return TaskType.SemanticSearch;
        }
        if (/\b(think|reason|logic|step\s+by\s+step)\b/i.test(lastMsg)) {
            return TaskType.Reasoning;
        }
        if (lastMsg.includes('```') || /\b(function|class|debug|implement|implementation|refactor|code|method|compile|build|test|rust|python|javascript|golang|cpp|c\+\+|java|ruby|php|html|css|sql|develop|program|script)\b/i.test(lastMsg)) {
            return TaskType.Coding;
        }
        if (lastMsg.includes('who are you') || lastMsg.includes('what can you do') || /\b(help|capabilities)\b/i.test(lastMsg)) {
            return TaskType.UserIntent;
        }

        return TaskType.Chat;
    }

    private static getOriginalUserContent(content: string): string {
        const index = content.indexOf('<!-- TF-IDF SUMMARY -->');
        if (index !== -1) {
            return content.substring(0, index).trim();
        }
        return content;
    }
}
