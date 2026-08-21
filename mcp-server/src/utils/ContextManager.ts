import type { Message } from '../providers/types.js';
import type { PipelineContext } from '../pipeline/middleware.js';
import { getMessageContent } from './MessageUtils.js';
import { getSharedEncoder } from './tiktoken.js';

/**
 * Controls how context overflow is handled.
 */
export type OverflowStrategy = 'sliding-window' | 'truncate-oldest' | 'chunk-mapreduce';

export interface ContextCompressionResult {
    messages: Message[];
    strategy: OverflowStrategy;
    originalTokens: number;
    compressedTokens: number;
    chunksProcessed?: number;
}

/**
 * ContextManager - Handles context overflow without losing semantic meaning.
 *
 * Three-tier strategy:
 * 1. Sliding Window: Keep recent messages + compressed summary of older ones.
 * 2. Truncate-Oldest: Simple hard cut of oldest non-system messages.
 * 3. Chunk MapReduce: Split large inputs into chunks, process each, then merge.
 *
 * Priority: sliding-window → truncate-oldest (for chat tasks)
 * For document-heavy tasks: chunk-mapreduce is orchestrated by the caller.
 */
export class ContextManager {
    private get encoder() {
        return getSharedEncoder();
    }

    /**
     * Count tokens for a message array.
     */
    countTokens(messages: Message[]): number {
        let totalChars = 0;
        for (const msg of messages) {
            totalChars += getMessageContent(msg).length;
        }

        // Optimization: If the string is massive (> 20k chars), 
        // return an accurate fast upper bound estimate immediately (~3.8 chars/token)
        if (totalChars > 20000) {
            return Math.ceil(totalChars / 3.8);
        }

        let total = 0;
        for (const msg of messages) {
            total += this.encoder.encode(getMessageContent(msg)).length + 4; // ~4 overhead per msg
        }
        return total;
    }

    /**
     * Count tokens for a single string.
     */
    countStringTokens(text: string): number {
        return this.encoder.encode(text).length;
    }

    /**
     * Main entry: compress a context to fit within targetTokens.
     * Returns the compressed message array and metadata.
     *
     * @param context      - The pipeline context to compress
     * @param targetTokens - Max tokens allowed (contextWindow - max_tokens reserved).
     *                       If the provider reported remaining token quota via response
     *                       headers (context.providerRemainingTokens), that real-time
     *                       figure overrides this estimate — bridging executor ↔ compressor.
     * @param summarizer   - Async fn that summarizes a block of text using an LLM
     */
    async compress(
        context: PipelineContext,
        targetTokens: number,
        summarizer: (text: string) => Promise<string>
    ): Promise<ContextCompressionResult> {
        // Bridge: if the provider told us exactly how many tokens remain,
        // use that as the real compression ceiling instead of the static estimate.
        const effectiveTarget = (context.providerRemainingTokens !== undefined && context.providerRemainingTokens > 0)
            ? Math.min(targetTokens, context.providerRemainingTokens)
            : targetTokens;

        const messages = [...context.request.messages];
        const originalTokens = this.countTokens(messages);

        // Already fits — nothing to do
        if (originalTokens <= effectiveTarget) {
            return { messages, strategy: 'sliding-window', originalTokens, compressedTokens: originalTokens };
        }

        // --- Tier 0: Offline Heuristic Compression (Free) ---
        const heuristicMessages = this.heuristicCompress(messages, effectiveTarget);
        const heuristicTokens = this.countTokens(heuristicMessages);
        if (heuristicTokens <= effectiveTarget) {
            return {
                messages: heuristicMessages,
                strategy: 'sliding-window',
                originalTokens,
                compressedTokens: heuristicTokens
            };
        }

        // --- Tier 1: Sliding Window with Summarization ---
        const result = await this.slidingWindow(heuristicMessages, effectiveTarget, summarizer);
        if (result.compressedTokens <= effectiveTarget) {
            return result;
        }

        // --- Tier 2: Truncate Oldest (fast fallback) ---
        const truncated = this.truncateOldest(messages, effectiveTarget);
        return truncated;
    }

    /**
     * Sliding Window Strategy:
     * - Preserves the system prompt (if any)
     * - Compresses older messages into a single summary injected as a system note
     * - Always keeps the N most recent messages verbatim
     * - Summary is generated using a provided lightweight LLM call
     */
    async slidingWindow(
        messages: Message[],
        targetTokens: number,
        summarizer: (text: string) => Promise<string>
    ): Promise<ContextCompressionResult> {
        const originalTokens = this.countTokens(messages);

        let systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // BUDGETING: System messages should not consume more than 60% of the target window.
        // This prevents "Context Explosion" where multiple turns of agentic context injection
        // or massive workspace snippets drown out the actual conversation.
        const systemBudget = Math.floor(targetTokens * 0.6);
        let systemTokens = this.countTokens(systemMsgs);

        if (systemTokens > systemBudget) {
            console.error(`[ContextManager] System messages (${systemTokens} tokens) exceed budget (${systemBudget}). Truncating...`);
            // Keep the first (usually the primary instructions) and the last (usually the latest context)
            if (systemMsgs.length > 2) {
                systemMsgs = [systemMsgs[0], systemMsgs[systemMsgs.length - 1]];
                systemTokens = this.countTokens(systemMsgs);
            }
            
            // If still over budget, truncate the content of the largest system message
            if (systemTokens > systemBudget) {
                systemMsgs = systemMsgs.map(msg => {
                    const content = getMessageContent(msg);
                    if (this.countStringTokens(content) > systemBudget / systemMsgs.length) {
                        const ratio = (systemBudget / systemMsgs.length) / this.countStringTokens(content);
                        return { ...msg, content: content.slice(0, Math.floor(content.length * ratio * 0.9)) + '\n... (system context truncated to fit budget)' };
                    }
                    return msg;
                });
            }
        }

        // SAFEGUARD: If messages are astronomically large (>100k tokens), perform extreme Tier 0 truncation first
        // to prevent the summarizer itself from being overwhelmed or hanging.
        if (originalTokens > 100000) {
            const preProcessed = this.heuristicCompress(messages, 50000); // Reduce to 50k first
            return this.slidingWindow(preProcessed, targetTokens, summarizer);
        }

        // Keep at minimum the last 4 messages (2 exchanges) verbatim
        const KEEP_RECENT = Math.min(4, nonSystemMsgs.length);
        
        // PIN THE FIRST MESSAGE: The first user prompt usually contains the core task instructions.
        // We must never summarize it away in long histories, otherwise the agent will suffer from "task drift".
        // We only do this if the history is long enough to justify keeping an extra verbatim slot.
        let pinnedMsg: Message | null = null;
        let oldMsgs: Message[] = [];
        let recentMsgs: Message[] = [];

        if (nonSystemMsgs.length > KEEP_RECENT * 2) {
            pinnedMsg = nonSystemMsgs[0];
            // The remaining messages are split between "old" (to be summarized) and "recent" (kept verbatim)
            const unpinnedMsgs = nonSystemMsgs.slice(1);
            recentMsgs = unpinnedMsgs.slice(-KEEP_RECENT);
            oldMsgs = unpinnedMsgs.slice(0, -KEEP_RECENT);
        } else {
            recentMsgs = nonSystemMsgs.slice(-KEEP_RECENT);
            oldMsgs = nonSystemMsgs.slice(0, -KEEP_RECENT);
        }

        if (oldMsgs.length === 0) {
            // Can't compress further without dropping recent context — return as-is
            return {
                messages,
                strategy: 'sliding-window',
                originalTokens,
                compressedTokens: originalTokens,
            };
        }

        const historyText = oldMsgs
            .map(m => `${m.role.toUpperCase()}: ${getMessageContent(m)}`)
            .join('\n---\n');

        const historyTextTokens = this.countStringTokens(historyText);
        const MAX_SUMMARY_CONTEXT = 32000;

        let summary: string;
        try {
            if (historyTextTokens > MAX_SUMMARY_CONTEXT) {
                console.error(`[ContextManager] History too large (${historyTextTokens} tokens), chunking...`);
                
                // Robust chunking: split by word if possible, but hard-split by total tokens if words are too long
                const chunks: string[] = [];
                let currentChunkText = '';
                let currentChunkTokens = 0;
                
                const words = historyText.split(/\s+/);
                for (const word of words) {
                    const wordTokens = this.countStringTokens(word + ' ');
                    
                    if (wordTokens > MAX_SUMMARY_CONTEXT) {
                        // Edge case: a single word is larger than the entire context limit!
                        // Flush current chunk if any
                        if (currentChunkText) {
                            chunks.push(currentChunkText.trim());
                            currentChunkText = '';
                            currentChunkTokens = 0;
                        }
                        
                        // Slice the massive word
                        let wordRemaining = word;
                        while (wordRemaining.length > 0) {
                            const sliceChars = MAX_SUMMARY_CONTEXT * 2; 
                            const slice = wordRemaining.slice(0, sliceChars);
                            chunks.push(slice);
                            wordRemaining = wordRemaining.slice(sliceChars);
                        }
                        continue;
                    }

                    if (currentChunkTokens + wordTokens > MAX_SUMMARY_CONTEXT && currentChunkText) {
                        chunks.push(currentChunkText.trim());
                        currentChunkText = '';
                        currentChunkTokens = 0;
                    }
                    
                    currentChunkText += word + ' ';
                    currentChunkTokens += wordTokens;
                }
                
                if (currentChunkText) chunks.push(currentChunkText.trim());

                const MAX_CHUNKS = 5;
                if (chunks.length > MAX_CHUNKS) {
                    console.error(`[ContextManager] Too many chunks (${chunks.length}), falling back to truncation...`);
                    throw new Error('Too many chunks for summarization');
                }

                const chunkSummaries = await Promise.allSettled(
                    chunks.map(chunk => summarizer(`Summarize this segment of conversation concisely:\n\n${chunk}`))
                );
                const successfulSummaries = chunkSummaries
                    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
                    .map(r => r.value);

                if (successfulSummaries.length === 0) throw new Error('All chunk summaries failed');

                // Reduce
                summary = await summarizer(
                    `Merge these sequential conversation summaries into one dense summary. Preserve facts/context:\n\n${successfulSummaries.join('\n---\n')}`
                );
            } else {
                console.error(`[ContextManager] Requesting single summary for ${historyTextTokens} tokens...`);
                summary = await summarizer(
                    `Summarize the following conversation history concisely, preserving all key facts, decisions, and context. Be dense — output only the summary, no preamble:\n\n${historyText}`
                );
            }
        } catch {
            // If summarization fails, fall back to simple truncation
            return this.truncateOldest(messages, targetTokens);
        }

        const summaryMsg: Message = {
            role: 'system',
            content: `[Context Summary — earlier conversation]: ${summary}`,
        };

        const compressed: Message[] = [...systemMsgs];
        if (pinnedMsg) compressed.push(pinnedMsg);
        compressed.push(summaryMsg);
        compressed.push(...recentMsgs);
        const compressedTokens = this.countTokens(compressed);

        return {
            messages: compressed,
            strategy: 'sliding-window',
            originalTokens,
            compressedTokens,
        };
    }

    /**
     * Tier 0: Offline Heuristic Compression
     * Low-cost, regex-based compression that preserves key context without API calls.
     */
    heuristicCompress(messages: Message[], targetTokens: number): Message[] {
        const systemMsgs = messages.filter(m => m.role === 'system');
        const nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // Heuristic: If we are WAY over budget (> 2x), be extremely aggressive
        const totalTokens = this.countTokens(messages);
        const isWayOver = totalTokens > targetTokens * 2;

        // Always keep the last 2 messages (1 exchange) entirely, UNLESS they are massive blobs
        const KEEP_RECENT = Math.min(2, nonSystemMsgs.length);
        const recentMsgs = nonSystemMsgs.slice(-KEEP_RECENT);
        const oldMsgs = nonSystemMsgs.slice(0, -KEEP_RECENT);

        const processMessage = (msg: Message): Message => {
            let content = getMessageContent(msg);
            
            // Emergency pre-truncation for massive unstructured text (> 15k chars)
            if (content.length > 15000) {
                content = content.substring(0, 5000) + ' [...truncated...] ' + content.substring(content.length - 1000);
            }

            // Keep code-heavy messages or short ones intact
            if (content.includes('```') || content.length < 500) {
                return { ...msg, content };
            }

            // Extract first and last sentences of long prose
            const sentences = content.split(/[.!?]\s+/);
            if (sentences.length <= 3) return { ...msg, content };

            if (isWayOver) {
                // Extremely aggressive: keep only first sentence and last sentence
                const compressedContent = `${sentences[0]}. ... [stripped ${sentences.length - 2} sentences] ... ${sentences[sentences.length - 1]}.`;
                return { ...msg, content: compressedContent };
            }

            const compressedContent = `${sentences[0]}. ${sentences[1]}. ... [summarized] ... ${sentences[sentences.length - 1]}.`;
            return { ...msg, content: compressedContent };
        };

        const compressedOld = oldMsgs.map(processMessage);
        const processedRecent = recentMsgs.map(msg => {
            // Only aggressively truncate recent if it's really the ONLY message and it's huge
            if (nonSystemMsgs.length === 1 && getMessageContent(msg).length > 20000) {
                return processMessage(msg);
            }
            return msg;
        });

        return [...systemMsgs, ...compressedOld, ...processedRecent];
    }

    /**
     * Truncate-Oldest Strategy:
     * Hard-drops oldest non-system messages until within budget.
     * Fast but lossy — use only as last resort before chunking.
     */
    truncateOldest(messages: Message[], targetTokens: number): ContextCompressionResult {
        const originalTokens = this.countTokens(messages);
        const systemMsgs = messages.filter(m => m.role === 'system');
        let nonSystemMsgs = messages.filter(m => m.role !== 'system');

        // 1. First drop whole messages
        while (nonSystemMsgs.length > 1) {
            const candidate = [...systemMsgs, ...nonSystemMsgs];
            if (this.countTokens(candidate) <= targetTokens) break;
            nonSystemMsgs = nonSystemMsgs.slice(1);
        }

        // 2. If still over budget and one message remains, truncate that one message
        let result = [...systemMsgs, ...nonSystemMsgs];
        if (this.countTokens(result) > targetTokens && nonSystemMsgs.length > 0) {
            const lastMsg = nonSystemMsgs[nonSystemMsgs.length - 1];
            const systemTokens = this.countTokens(systemMsgs);
            const remainingBudget = Math.max(0, targetTokens - systemTokens - 20); // 20 buffer

            if (remainingBudget > 5) {
                const content = getMessageContent(lastMsg);
                // High-performance truncation
                const approxChars = remainingBudget * 3;
                let truncatedContent = content.slice(-approxChars);

                let currentTokens = this.countStringTokens(truncatedContent);

                if (currentTokens > remainingBudget) {
                    const ratio = remainingBudget / currentTokens;
                    truncatedContent = truncatedContent.slice(-Math.floor(truncatedContent.length * ratio * 0.9));
                }

                nonSystemMsgs[nonSystemMsgs.length - 1] = {
                    ...lastMsg,
                    content: `[...truncated...] ${truncatedContent.trim()}`
                };
            } else {
                // System messages alone exceed the target budget.
                // Keep the last 1500 tokens of the user message (or the whole message if smaller)
                // so we don't wipe out the code context.
                const content = getMessageContent(lastMsg);
                const approxChars = 1500 * 3;
                if (content.length > approxChars) {
                    const truncatedContent = content.slice(-approxChars);
                    nonSystemMsgs[nonSystemMsgs.length - 1] = {
                        ...lastMsg,
                        content: `[...truncated...] ${truncatedContent.trim()}`
                    };
                }
            }
            result = [...systemMsgs, ...nonSystemMsgs];
        }

        return {
            messages: result,
            strategy: 'truncate-oldest',
            originalTokens,
            compressedTokens: this.countTokens(result),
        };
    }

    /**
     * Chunk MapReduce Strategy:
     * For large single-message inputs (documents, long code).
     */
    async chunkMapReduce(
        context: PipelineContext,
        chunkTokenSize: number,
        executor: (chunkContext: PipelineContext) => Promise<string>,
        reducer: (partialResults: string[], originalContext: PipelineContext) => Promise<string>
    ): Promise<string> {
        const messages = context.request.messages;
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

        if (!lastUserMsg) {
            throw new Error('[ContextManager] No user message found to chunk');
        }

        const lastUserContent = getMessageContent(lastUserMsg);
        const words = lastUserContent.split(/\s+/);
        const chunks: string[] = [];
        let currentChunk: string[] = [];
        let currentTokens = 0;

        for (const word of words) {
            const wordTokens = this.countStringTokens(word + ' ');
            if (currentTokens + wordTokens > chunkTokenSize && currentChunk.length > 0) {
                chunks.push(currentChunk.join(' '));
                currentChunk = currentChunk.slice(-50);
                currentTokens = this.countStringTokens(currentChunk.join(' '));
            }
            currentChunk.push(word);
            currentTokens += wordTokens;
        }
        if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));

        if (chunks.length === 1) {
            return executor(context);
        }

        console.error(`[ContextManager] MapReduce: splitting into ${chunks.length} chunks`);

        const chunkResults = await Promise.allSettled(
            chunks.map((chunk, i) => {
                const chunkContext: PipelineContext = {
                    ...context,
                    request: {
                        ...context.request,
                        messages: [
                            ...messages.filter(m => m.role === 'system'),
                            {
                                role: 'user',
                                content: `[Part ${i + 1}/${chunks.length}] Process this section:\n\n${chunk}`,
                            },
                        ],
                    },
                };
                return executor(chunkContext);
            })
        );

        const successfulResults = chunkResults
            .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
            .map(r => r.value);

        if (successfulResults.length === 0) {
            throw new Error('[ContextManager] All chunks failed during MapReduce');
        }

        return reducer(successfulResults, context);
    }
}
