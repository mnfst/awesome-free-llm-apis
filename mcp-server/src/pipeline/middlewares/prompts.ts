import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAgentsMdPath } from '../../utils/agents-md-locator.js';

/**
 * Calculates Jaccard similarity between a set of tokens and a string.
 */
function calculateJaccardSimilarity(setA: Set<string>, str: string): number {
    const words = str.toLowerCase().split(/\W+/).filter(Boolean);
    if (words.length === 0) return 0;
    
    let intersection = 0;
    const uniqueWords = new Set(words);
    uniqueWords.forEach(w => {
        if (setA.has(w)) intersection++;
    });
    
    return intersection / (setA.size + uniqueWords.size - intersection);
}

/**
 * Filters paragraphs or entries within prompt sections using Jaccard semantic similarity.
 */
function compressContentSemantically(content: string, semanticTokens: Set<string>, threshold = 1.5): string {
    if (semanticTokens.size === 0) return content;

    const paragraphs = content.split(/\n\n+/);
    const keptParagraphs: string[] = [];

    for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();
        
        // Preserve headers and markdown structure
        if (trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('```') || /^[A-Z0-9\s_\-:]+$/.test(trimmed)) {
            keptParagraphs.push(paragraph);
            continue;
        }

        // If it's a list (lines starting with - or * or numbers)
        if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
            const lines = paragraph.split('\n');
            const keptLines: string[] = [];
            let currentHeaderLine = "";

            for (const line of lines) {
                const lineTrimmed = line.trim();
                if (!lineTrimmed.startsWith('-') && !lineTrimmed.startsWith('*') && !/^\d+\./.test(lineTrimmed)) {
                    currentHeaderLine = line;
                    continue;
                }

                // Compute line TF-IDF score
                const lineWords = lineTrimmed.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
                let lineScore = 0;
                const matchedTokens = new Set<string>();
                lineWords.forEach(w => {
                    if (semanticTokens.has(w)) matchedTokens.add(w);
                });
                matchedTokens.forEach(t => {
                    lineScore += getIDF(t);
                });

                if (lineScore >= threshold) {
                    if (currentHeaderLine) {
                        keptLines.push(currentHeaderLine);
                        currentHeaderLine = "";
                    }
                    keptLines.push(line);
                }
            }

            if (keptLines.length > 0) {
                keptParagraphs.push(keptLines.join('\n'));
            }
            continue;
        }

        // For prose paragraphs, check overall paragraph TF-IDF score
        const paraWords = trimmed.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
        let paraScore = 0;
        const matchedTokens = new Set<string>();
        paraWords.forEach(w => {
            if (semanticTokens.has(w)) matchedTokens.add(w);
        });
        matchedTokens.forEach(t => {
            paraScore += getIDF(t);
        });

        // Always keep the very first paragraph of the section for context
        if (paraScore >= threshold || paragraphs.indexOf(paragraph) === 0) {
            keptParagraphs.push(paragraph);
        }
    }

    return keptParagraphs.join('\n\n');
}

/** Minimum character length for a raw prompt file to be considered valid. */
const MIN_PROMPT_LENGTH = 500;
/** Maximum character budget for the dynamically assembled system prompt. */
const PROMPT_CHAR_BUDGET = 12000;

// Resolve the base directory relative to this file, not process.cwd(),
// so it works correctly regardless of where the process is launched from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = path.resolve(
    process.env.AGENT_PROMPT_PATH ?? path.join(__dirname, '../../../../external/agent-prompt'),
);
const README = path.join(BASE, 'README.md');
const JSON_PROMPT = path.join(BASE, 'prompt.json');

/**
 * Protocol injected when architectural reference sections are present.
 */
const REFERENCE_SUGGESTION_PROTOCOL = `
## 🔗 REFERENCE SUGGESTION PROTOCOL
When your output contains matches from the 'RESEARCH APPENDIX' or 'SUBSYSTEM REFERENCE MAP', you MUST:
1. Provide the direct URL to the project/appendix item.
2. Briefly explain why this reference is relevant to the user's current task.
3. Use the following format for references:
   - [Project Name](URL): Description / Useful pattern.
`;

/**
 * Mandatory Grounding Protocol (v1.0.4)
 * Forces the model to explicitly verify its source before answering.
 */
const GROUNDING_PROTOCOL = `
## 🔍 GROUNDING
- Cite files as: \`[RETRIEVED] filename\` — only from injected \`[Context]\` blocks.
- No \`[Context]\` block for a topic = pipeline found no match. Say: "Workspace context unavailable for [X]."
- Never infer file content from training data. Ask the user to share the file instead.
`;



interface PromptSection {
    id: string;
    title: string;
    content: string;
    level: number;
    keywords: string[];
}

interface PromptData {
    metadata: { version: string };
    introduction: string;
    sections: PromptSection[];
}

let cachedPromptData: PromptData | null = null;
let lastMtime: number = 0;
let cachedIdfMap: Map<string, number> | null = null;

function getIDF(word: string): number {
    if (!cachedIdfMap) return 0;
    const df = cachedIdfMap.get(word.toLowerCase()) || 0;
    const N = cachedPromptData?.sections.length || 1;
    return df > 0 ? Math.log(1 + N / df) : Math.log(1 + N);
}

/**
 * Resets the in-memory cache. Used primarily for testing or forced reloads.
 */
export function resetPromptCache(): void {
    cachedPromptData = null;
    lastMtime = 0;
    cachedIdfMap = null;
}

/**
 * Version-aware Emergency Fallback Prompt.
 * Used only when the configuration pipeline (prompt.json) is critically broken.
 */
const EMERGENCY_PROMPT_V1 = `
# ⚠️ SYSTEM ALERT: RUNNING IN DEGRADED FALLBACK MODE
The primary agent configuration (prompt.json) could not be loaded. 
Reliability and workspace-awareness may be degraded.

## ROLE
You are the principal architect of a self-improving agentic operating system.
Your goal is to build, coordinate, and verify work across the full range of computer tasks.

## MANDATORY PROTOCOLS
1. **Verification-First**: Never mark a task as done without running verification scripts.
2. **File-Based State**: Maintain tasks.md and plan.md as the source of truth.
3. **Tool-First**: ALWAYS check memory via \`manage_memory\` before starting project tasks.
4. **Closed-Loop**: goal -> task graph -> execution -> verification -> memory update.
`;


async function loadPromptData(): Promise<PromptData | null> {
    try {
        const stats = await fsp.stat(JSON_PROMPT);
        const mtime = stats.mtimeMs;

        if (cachedPromptData && mtime === lastMtime) {
            return cachedPromptData;
        }

        const raw = await fsp.readFile(JSON_PROMPT, 'utf-8');
        if (raw.length < MIN_PROMPT_LENGTH) {
            return null;
        }

        const data = JSON.parse(raw);
        cachedPromptData = data;
        lastMtime = mtime;

        // Recompute IDF Map
        const dfMap = new Map<string, number>();
        const getWords = (text: string): Set<string> => {
            const words = text.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
            return new Set(words);
        };
        data.sections.forEach((sec: any) => {
            const uniqueWords = getWords((sec.title || "") + " " + (sec.content || "") + " " + (sec.keywords || []).join(" "));
            uniqueWords.forEach(w => {
                dfMap.set(w, (dfMap.get(w) || 0) + 1);
            });
        });
        cachedIdfMap = dfMap;

        return data;
    } catch (e) {
        return null;
    }
}


function getMinimalIdentity(data: PromptData): string {
    const firstPara = (data.introduction || "").split('\n\n')[0];
    return `# ROLE\n${firstPara}\n`;
}

/**
 * Scoring sections based on keywords and assembles the prompt.
 * If explicitKeywords are provided, fuzzy tokenization of the context is bypassed (Strict Steering).
 */
export interface PromptOptions {
    context?: string;
    keywords?: string[];
    memory?: string;
    workspace?: string;
    isSubtask?: boolean;
    mainPrompt?: string;
    workspaceRoot?: string;
}

async function getRelevantAgentsGuide(workspaceRoot: string, subtaskQuery: string): Promise<string> {
    try {
        const agentsPaths = [
            findAgentsMdPath(workspaceRoot),
            path.join(workspaceRoot, 'AGENTS.md')
        ].filter((p): p is string => !!p);

        let filePath = '';
        for (const p of agentsPaths) {
            try {
                const stat = await fsp.stat(p);
                if (stat.isFile()) {
                    filePath = p;
                    break;
                }
            } catch {}
        }
        
        if (!filePath) return '';
        
        const content = await fsp.readFile(filePath, 'utf-8');
        
        // Split AGENTS.md into sections based on headers
        const lines = content.split('\n');
        interface Section {
            title: string;
            content: string;
        }
        
        const sections: Section[] = [];
        let currentSection: Section | null = null;
        
        for (const line of lines) {
            if (line.startsWith('#')) {
                if (currentSection) {
                    sections.push(currentSection);
                }
                currentSection = {
                    title: line.replace(/^#+\s+/, '').trim(),
                    content: line + '\n'
                };
            } else if (currentSection) {
                currentSection.content += line + '\n';
            }
        }
        if (currentSection) {
            sections.push(currentSection);
        }
        
        if (sections.length === 0) return '';
        
        // Semantic selection using Jaccard/keyword overlap with the subtaskQuery
        const queryTokens = new Set(subtaskQuery.toLowerCase().split(/\W+/).filter(t => t.length >= 3));
        if (queryTokens.size === 0) {
            // Default to first section (usually structural summary or introduction)
            return `### 📋 Target Project Guide (${path.basename(filePath)})\n${sections[0].content.slice(0, 2000)}\n`;
        }
        
        const scoredSections = sections.map(sec => {
            const words = sec.content.toLowerCase().split(/\W+/).filter(Boolean);
            const uniqueWords = new Set(words);
            let matchCount = 0;
            uniqueWords.forEach(w => {
                if (queryTokens.has(w)) matchCount++;
            });
            const jaccard = matchCount / (queryTokens.size + uniqueWords.size - matchCount);
            return { sec, score: jaccard };
        });
        
        // Sort and select top matching sections (score > 0.02)
        const relevant = scoredSections
            .filter(item => item.score > 0.02)
            .sort((a, b) => b.score - a.score)
            .slice(0, 2) // Limit to top 2 sections to avoid context bloat
            .map(item => item.sec);
            
        if (relevant.length === 0) {
            // Default to introduction section if no specific match
            return `### 📋 Target Project Guide (Introduction)\n${sections[0].content.slice(0, 2000)}\n`;
        }
        
        let output = `### 📋 Target Project Guide (Contextually Filtered from ${path.basename(filePath)})\n`;
        for (const sec of relevant) {
            const sectionContent = sec.content.length > 3000 ? sec.content.slice(0, 3000) + '\n... [section truncated]' : sec.content;
            output += `\n#### ${sec.title}\n${sectionContent}\n`;
        }
        
        return output;
    } catch {
        return '';
    }
}

/**
 * Assembles a contextually relevant system prompt.
 * Uses strict keyword steering if provided, otherwise falls back to fuzzy tokenization.
 */
export async function getIntelligentSystemPrompt(
    contextOrOptions: string | PromptOptions = "",
    explicitKeywords?: string[],
    memoryContext?: string,
    isSubtask: boolean = false
): Promise<string> {
    let context = "";
    let workspaceContext: string | undefined;
    let mainPrompt: string | undefined;
    let workspaceRoot: string | undefined;
    if (typeof contextOrOptions === 'object') {
        context = contextOrOptions.context || "";
        explicitKeywords = contextOrOptions.keywords;
        memoryContext = contextOrOptions.memory;
        workspaceContext = contextOrOptions.workspace;
        isSubtask = contextOrOptions.isSubtask || false;
        mainPrompt = contextOrOptions.mainPrompt;
        workspaceRoot = contextOrOptions.workspaceRoot;
    } else {
        context = contextOrOptions;
    }
    
    const contextLower = context.toLowerCase();
    const data = await loadPromptData();
    if (!data) {
        try {
            // Tier 2 Fallback: Load raw README if JSON is missing/corrupt
            const readme = await fsp.readFile(README, 'utf-8');
            return readme + "\n\n" + GROUNDING_PROTOCOL;
        } catch (e) {
            // Tier 3 Fallback: Hardcoded emergency prompt
            return EMERGENCY_PROMPT_V1;
        }
    }

    const introduction = isSubtask ? getMinimalIdentity(data) : (`# ROLE\n${data.introduction || ""}\n`);
    let assembled = introduction;

    // Inject Workspace Memory and File Context at the very top of the assembled prompt
    if (workspaceContext) {
        const cappedWorkspace = workspaceContext.length > 5000 ? workspaceContext.slice(0, 5000) + "\n... (truncated)" : workspaceContext;
        assembled = `## 📂 WORKSPACE CONTEXT\n<workspace_context_isolation_gate>\nRelevant file snippets and directory structures:\n${cappedWorkspace}\n</workspace_context_isolation_gate>\n\n` + assembled;
    }
    if (memoryContext) {
        const cappedMemory = memoryContext.length > 2000 ? memoryContext.slice(0, 2000) + "\n... (truncated)" : memoryContext;
        assembled = `## 🧠 WORKSPACE MEMORY\n<memory_context_isolation_gate>\nRelevant prior knowledge for this workspace:\n${cappedMemory}\n</memory_context_isolation_gate>\n\n` + assembled;
    }
    if (workspaceRoot) {
        const agentsGuide = await getRelevantAgentsGuide(workspaceRoot, context);
        if (agentsGuide) {
            assembled = `## 📋 TARGET PROJECT GUIDELINES\n<target_project_guidelines_isolation_gate>\n${agentsGuide}\n</target_project_guidelines_isolation_gate>\n\n` + assembled;
        }
    }

    if (!context && (!explicitKeywords || explicitKeywords.length === 0)) {
        const assembled = data.introduction + "\n" + data.sections
        .filter(s => s.level === 1)
        .map(s => {
            const content = s.content.length > 5000 ? s.content.substring(0, 4900) + "\n\n[...SECTION TRUNCATED...]\n" : s.content;
            return `\n\n## ${s.title}\n\n${content}`;
        })
        .join("");
        
        return `${assembled}${GROUNDING_PROTOCOL}`;
    }

    // Tokenize both context and mainPrompt to build query tokens
    const tokens = new Set<string>();
    const stopwords = new Set(['and', 'the', 'with', 'your', 'from', 'that', 'this', 'for', 'are', 'you', 'was', 'were', 'been', 'have', 'has', 'had']);
    
    const addTokens = (str: string) => {
        str.toLowerCase().split(/\W+/).forEach(t => {
            if (t.length >= 3 && !stopwords.has(t)) tokens.add(t);
        });
    };

    const isStrictSteering = explicitKeywords && explicitKeywords.length > 0 && 
        explicitKeywords.some(k => !['mcp', 'memory', 'filesystem'].includes(k.toLowerCase()));

    if (isStrictSteering) {
        explicitKeywords!.forEach(k => tokens.add(k.toLowerCase()));
    } else {
        if (explicitKeywords) {
            explicitKeywords.forEach(k => tokens.add(k.toLowerCase()));
        }
        if (contextLower) {
            addTokens(contextLower);
        }
        if (mainPrompt) {
            addTokens(mainPrompt);
        }
    }

    const isResearchQuery = /\b(explain|research|appendix|layers|architecture|design|structure|summary|system|theory)\b/i.test(contextLower);

    // Score sections
    const scoredSections = data.sections.map(section => {
        let score = 0;
        
        // Count keyword overlap to verify semantic relevance
        let keywordOverlapCount = 0;
        section.keywords.forEach(kw => {
            const kwLower = kw.toLowerCase();
            if (tokens.has(kwLower)) {
                keywordOverlapCount++;
                score += getIDF(kwLower);
            }
        });

        // 1. Explicit Keywords boost
        if (explicitKeywords) {
            const titleLower = section.title.toLowerCase();
            explicitKeywords.forEach(kw => {
                const kwLower = kw.toLowerCase();
                if (section.keywords.includes(kwLower)) {
                    score += 5.0;
                }
                if (titleLower.includes(kwLower)) {
                    score += 5.0;
                }
            });
        }

        // 2. Title relevance
        const titleMatchSource = (explicitKeywords && explicitKeywords.length > 0) 
            ? new Set(explicitKeywords.map(k => k.toLowerCase())) 
            : tokens;
            
        section.title.toLowerCase().split(/\W+/).forEach(t => {
            if (titleMatchSource.has(t)) {
                score += getIDF(t) * 1.5;
            }
        });

        if (section.level === 1) score += 1.0;
        if (section.level === 2) score += 0.5;

        // Semantic Category Constraints & subtask filtering
        const isReference = ['research_appendix', 'subsystem_reference_map', 'open_source_architecture_references'].includes(section.id);
        const isMetaPlan = ['reader_contract', 'momentum_ratchets', 'first_milestone_definition'].includes(section.id);

        if (isReference) {
            const architecturalKeywords = ['rest', 'api', 'url', 'github', 'architecture', 'patterns', 'audit'];
            architecturalKeywords.forEach(ak => { if (tokens.has(ak) || contextLower.includes(ak)) score += 2; });
        }

        // Subtask Optimization: Exclude high-level meta orchestration details
        if (isSubtask && isMetaPlan) {
            score = 0;
        }

        // Exclude reference appendices unless query is explicitly research/architecture oriented or has matching reference/architectural keywords
        const hasReferenceKeyword = tokens.has('appendix') || tokens.has('reference') || tokens.has('references') || tokens.has('research') || tokens.has('temporal') || tokens.has('stripe') || tokens.has('twilio') || tokens.has('api');
        if (isReference && !isResearchQuery && !hasReferenceKeyword) {
            score = 0;
        }

        // Strict Guard: Ensure at least one keyword matches query context to prevent semantic hallucination/noise
        if (keywordOverlapCount === 0 && !explicitKeywords && !isMetaPlan && !(isReference && hasReferenceKeyword)) {
            score = 0;
        }

        const scored = { ...section, score };
        return scored;
    });

    const minScore = 2.0; // Hardened threshold for high-density synthesis using IDF
    const relevant = scoredSections
        .filter(s => {
            if (s.score < minScore) return false;
            const isRef = ['research_appendix', 'subsystem_reference_map', 'open_source_architecture_references'].includes(s.id);
            if (isSubtask && isRef) return s.score > 10; // Adjusted threshold for IDF
            return true;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, isSubtask ? 5 : 7);

    // Reserve 1000 chars for introduction and protocols
    const budgetLimit = (isSubtask ? 8000 : PROMPT_CHAR_BUDGET) - 1000;
    let currentSize = assembled.length;

    for (const section of relevant) {
        let content = section.content;
        const isRef = ['research_appendix', 'subsystem_reference_map', 'open_source_architecture_references'].includes(section.id);
        const isStructuredLayers = section.id === 'system_layers_to_build';
        
        if (isRef) {
            const parts = content.split(/\n(?=\s*- )/).map(p => p.trim()).filter(p => p.length > 0);
            const scoredEntries: { entry: string, entryScore: number }[] = [];
            let currentCategory = "";
            // High-score sections (explicitly requested) get full content baseline, except reference maps.
            const isReferenceMap = section.id.includes('reference') || section.id.includes('appendix');
            const minEntryScore = (section.score > 20 && !isReferenceMap) ? 0 : (section.score > 8 ? 1.0 : 2.5);

            for (const part of parts) {
                if (part.trim().startsWith('-')) {
                    let entryScore = 0;
                    const contextText = (currentCategory + " " + part).toLowerCase();
                    contextText.split(/\W+/).forEach(et => {
                        if (tokens.has(et)) entryScore += (['python', 'rust', 'javascript', 'typescript', 'go'].includes(et)) ? 0.5 : getIDF(et);
                    });
                    tokens.forEach(t => { if (t.length > 3 && contextText.includes(t)) entryScore += getIDF(t) * 0.25; });
                    scoredEntries.push({ entry: part, entryScore });
                } else {
                    currentCategory = part.replace(/^-\s*/, '');
                }
            }

            content = scoredEntries
                .filter(se => se.entryScore >= minEntryScore)
                .sort((a, b) => b.entryScore - a.entryScore)
                .slice(0, 15)
                .map(se => se.entry)
                .join('\n');
        } else if (isStructuredLayers) {
            // Parse system layers into individual blocks (e.g. LAYER A, LAYER B...)
            const blocks = content.split(/(?=^LAYER [A-Z]:)/m);
            const processedBlocks = blocks.map(block => {
                const lines = block.trim().split('\n');
                if (lines.length <= 1) return block;

                const headerLine = lines[0];
                let blockScore = 0;
                const blockTextLower = block.toLowerCase();
                const matchedTokens = new Set<string>();
                blockTextLower.split(/\W+/).forEach(t => {
                    if (tokens.has(t)) matchedTokens.add(t);
                });
                matchedTokens.forEach(t => {
                    blockScore += getIDF(t);
                });

                // If block is irrelevant and budget pressure or subtask is active, compress to header only
                const remainingBudget = budgetLimit - currentSize;
                const isUnderPressure = remainingBudget < 5000;
                if (blockScore < 1.5 && (isUnderPressure || isSubtask)) {
                    return `${headerLine}\n*(Detailed description omitted to fit prompt token budget)*`;
                }
                return block;
            });
            content = processedBlocks.join('\n\n');
        } else {
            // For general sections, compress them semantically based on IDF weights
            content = compressContentSemantically(content, tokens, 1.5);
        }

        if (content.length > 0) {
            const header = `\n\n## ${section.title}\n\n`;
            const remainingBudget = budgetLimit - currentSize;
            
            if (remainingBudget > header.length + 50) {
                let blockContent = content;
                const MAX_SECTION_SIZE = isSubtask ? 2000 : 4000;
                if (blockContent.length > MAX_SECTION_SIZE) {
                    blockContent = blockContent.substring(0, MAX_SECTION_SIZE) + "\n[...SECTION TRUNCATED...]\n";
                }
                
                if (header.length + blockContent.length > remainingBudget) {
                    blockContent = blockContent.slice(0, Math.max(0, remainingBudget - header.length - 20)) + "\n[...TRUNCATED...]";
                }
                
                const block = header + blockContent;
                assembled += block;
                currentSize += block.length;
            }
        }
    }

    if (relevant.some(s => ['research_appendix', 'subsystem_reference_map'].includes(s.id))) {
        assembled += `\n\n${REFERENCE_SUGGESTION_PROTOCOL}`;
    }

    assembled += `\n\n${GROUNDING_PROTOCOL}`;
    return assembled;
}
