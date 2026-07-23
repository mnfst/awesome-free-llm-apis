import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { ProviderRegistry } from '../providers/registry.js';
import { getMessageContent } from '../utils/MessageUtils.js';
import { ScraperExporter } from '../utils/ScraperExporter.js';
import { ContextSanitizer, NetworkStateTracker } from '../utils/NetworkStateTracker.js';
import { logToolCall } from '../utils/ChatLogger.js';

export interface ScrapingSessionCheckpoint {
    sessionId: string;
    targetUrl: string;
    domainContext: string;
    status: 'INITIALIZED' | 'SURFACE_EXPLORED' | 'NODES_DISCOVERED' | 'PLAYER_CARDS_DISCOVERED' | 'AWAITING_USER_SELECTION' | 'EXECUTING_SELECTED_OPTION' | 'PAUSED' | 'RESUMED' | 'COMPLETED' | string;
    currentPage: number;
    visitedUrls: string[];
    pendingUrlQueue: string[];
    domStateFingerprint: string;
    accumulatedRecords: Record<string, any>[];
    deepRecords: Record<string, any>[];
    discoveredNodes: Array<{ index: number; label: string; tag: string; role?: string; href?: string }>;
    discoveredSections: string[];
    userPreferences?: Record<string, any>;
    lastUpdated: string;
}

export interface BrowserScrapeInput {
    url: string;
    action?: string;
    domainContext?: string;
    userInstructions?: string;
    outputDir?: string;
    filenameBase?: string;
    sessionId?: string;
    continueFromState?: boolean;
    forceRegenerateScript?: boolean;
    deepScrapeLimit?: number;
}

export interface ScrapeResult {
    success: boolean;
    url: string;
    domainContext: string;
    recordCount: number;
    totalAccumulatedRecords: number;
    deepRecordCount: number;
    jsonPath?: string;
    csvPath?: string;
    deepJsonPath?: string;
    deepCsvPath?: string;
    checkpointPath?: string;
    sampleRecords: Record<string, any>[];
    sampleDeepRecords?: Record<string, any>[];
    usedPersistedScript: boolean;
    error?: string;
}

export class DomStateFingerprinter {
    static computeHash(snapshotText: string): string {
        if (!snapshotText) return '';
        const normalized = snapshotText
            .split('\n')
            .map(l => l.trim())
            .filter(l => !l.includes('timestamp') && !l.includes('ms'))
            .join('\n');
        return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    }

    static hasStateChanged(previousHash: string, currentHash: string): boolean {
        if (!previousHash || !currentHash) return true;
        return previousHash !== currentHash;
    }
}

export class ScrapingSessionCheckpointManager {
    static getCheckpointPath(outputDir: string, sessionId: string): string {
        const checkpointDir = path.join(outputDir, 'checkpoints');
        return path.join(checkpointDir, `${sessionId}_checkpoint.json`);
    }

    static async loadCheckpoint(outputDir: string, sessionId: string): Promise<ScrapingSessionCheckpoint | null> {
        try {
            const cpPath = ScrapingSessionCheckpointManager.getCheckpointPath(outputDir, sessionId);
            const raw = await fs.readFile(cpPath, 'utf-8');
            const cp = JSON.parse(raw);
            await logToolCall(sessionId, 'browser_tool:load_checkpoint', { outputDir, sessionId }, { success: true, status: cp.status }, 0, false).catch(() => {});
            return cp;
        } catch {
            return null;
        }
    }

    static async saveCheckpoint(outputDir: string, checkpoint: ScrapingSessionCheckpoint): Promise<string> {
        const checkpointDir = path.join(outputDir, 'checkpoints');
        await fs.mkdir(checkpointDir, { recursive: true });
        const cpPath = ScrapingSessionCheckpointManager.getCheckpointPath(outputDir, sessionIdToKey(checkpoint.sessionId));
        checkpoint.lastUpdated = new Date().toISOString();
        await fs.writeFile(cpPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
        await logToolCall(checkpoint.sessionId, 'browser_tool:save_checkpoint', { sessionId: checkpoint.sessionId, status: checkpoint.status }, { cpPath }, 0, false).catch(() => {});
        return cpPath;
    }

    static async listCheckpoints(outputDir: string): Promise<Array<{
        sessionId: string;
        targetUrl: string;
        domainContext: string;
        status: string;
        accumulatedRecordsCount: number;
        lastUpdated: string;
    }>> {
        try {
            const checkpointDir = path.join(outputDir, 'checkpoints');
            await fs.mkdir(checkpointDir, { recursive: true });
            const files = await fs.readdir(checkpointDir);
            const checkpoints: any[] = [];

            for (const f of files) {
                if (f.endsWith('_checkpoint.json')) {
                    try {
                        const raw = await fs.readFile(path.join(checkpointDir, f), 'utf-8');
                        const cp = JSON.parse(raw);
                        checkpoints.push({
                            sessionId: cp.sessionId,
                            targetUrl: cp.targetUrl,
                            domainContext: cp.domainContext,
                            status: cp.status,
                            accumulatedRecordsCount: cp.accumulatedRecords?.length || 0,
                            lastUpdated: cp.lastUpdated
                        });
                    } catch {}
                }
            }

            await logToolCall('browser_checkpoint_session', 'browser_tool:list_checkpoints', { outputDir }, { count: checkpoints.length, checkpoints }, 0, false).catch(() => {});
            return checkpoints;
        } catch {
            return [];
        }
    }
}

function sessionIdToKey(sessId: string): string {
    return sessId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * 100% Dynamic Node & Behavioral Analyzer.
 * Supports scrollIntoView() + click execution on any discovered element.
 */
export class DynamicNodeAnalyzer {
    static async discoverInteractiveNodes(mcpClient: any): Promise<Array<{ index: number; label: string; tag: string; role?: string; href?: string }>> {
        console.log(`🧠 [Dynamic Node Analyzer] Identifying interactive elements structurally (Zero hardcoding)...`);

        const evalResult: any = await mcpClient.callTool({
            name: 'evaluate_script',
            arguments: {
                function: `() => {
                    const allNodes = Array.from(document.querySelectorAll('a, button, div[role="button"], div[role="tab"], div[onclick], [data-id]'));
                    const candidates = allNodes.map((el, idx) => {
                        const href = el.href || el.getAttribute('href') || '';
                        const text = (el.innerText || el.textContent || '').trim().replace(/\\n/g, ' ');
                        const role = el.getAttribute('role') || el.tagName.toLowerCase();
                        return {
                            index: idx + 1,
                            label: text.slice(0, 40),
                            tag: el.tagName.toLowerCase(),
                            role,
                            href
                        };
                    }).filter(c => c.label.length >= 2);

                    const uniqueNodes = [];
                    const seen = new Set();
                    for (const c of candidates) {
                        const key = c.label + '|' + c.href;
                        if (!seen.has(key)) {
                            seen.add(key);
                            uniqueNodes.push(c);
                        }
                    }
                    return JSON.stringify(uniqueNodes.slice(0, 15));
                }`
            }
        });

        const rawText = evalResult?.content?.[0]?.text || '';
        let nodes: any[] = [];
        try {
            const match = rawText.match(/```json\n([\s\S]*?)\n```/);
            if (match && match[1]) {
                const parsed = JSON.parse(match[1]);
                nodes = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            }
        } catch {}

        await logToolCall('browser_node_session', 'browser_tool:discover_nodes', {}, { discoveredNodesCount: nodes.length, nodes }, 0, false).catch(() => {});
        return nodes;
    }

    /**
     * Executes scrollIntoView() to scroll directly to target node and clicks it.
     */
    static async scrollToAndClickNode(mcpClient: any, targetLabel: string): Promise<{ success: boolean; output: string }> {
        console.log(`📜👆 [Scroll-To & Click] Scrolling to and clicking element matching: "${targetLabel}"...`);

        const evalResult: any = await mcpClient.callTool({
            name: 'evaluate_script',
            arguments: {
                function: `() => {
                    const nodes = Array.from(document.querySelectorAll('a, button, div[role="button"], div[role="tab"], div[onclick]'));
                    const targetLabel = ${JSON.stringify(targetLabel)};
                    const target = nodes.find(n => (n.innerText || n.textContent || '').includes(targetLabel));
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => { target.click(); }, 800);
                        return "Successfully scrolled to and clicked element: " + (target.innerText || '').slice(0, 40);
                    }
                    return "Element matching " + targetLabel + " not found in DOM";
                }`
            }
        });

        const text = evalResult?.content?.[0]?.text || '';
        const success = text.includes('Successfully scrolled');
        const res = { success, output: text };
        await logToolCall('browser_node_session', 'browser_tool:click_node', { targetLabel }, res, 0, !success).catch(() => {});
        return res;
    }
}

export class SemanticDomCompressor {
    static extractTopRelatableBlocks(rawSnapshotText: string, topK: number = 5): string[] {
        if (!rawSnapshotText) return [];

        const lines = rawSnapshotText.split('\n');
        const relatableBlocks: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (
                /^\d+\.\d+\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9\s]+/.test(trimmed) ||
                trimmed.includes('/player/') ||
                trimmed.includes('/item/') ||
                trimmed.includes('/details/') ||
                trimmed.includes('rating') ||
                trimmed.includes('score') ||
                trimmed.includes('stat') ||
                trimmed.includes('info')
            ) {
                relatableBlocks.push(trimmed);
            }
        }

        return relatableBlocks.slice(0, topK * 4);
    }

    static compressSnapshot(rawSnapshotText: string): string {
        if (!rawSnapshotText) return '';

        const lines = rawSnapshotText.split('\n');
        const structuralLines: string[] = [];
        let linkCount = 0;

        for (const line of lines) {
            const trimmed = line.trim();
            if (
                trimmed.includes('link') ||
                trimmed.includes('button') ||
                trimmed.includes('heading') ||
                trimmed.includes('item') ||
                trimmed.includes('cell') ||
                trimmed.includes('row') ||
                trimmed.includes('article') ||
                trimmed.includes('rating') ||
                trimmed.includes('metric')
            ) {
                structuralLines.push(trimmed);
                if (trimmed.includes('link')) linkCount++;
                if (structuralLines.length >= 120) break;
            }
        }

        if (structuralLines.length < 10) {
            return lines.slice(0, 100).join('\n');
        }

        return `[DOM Structure Summary - ${linkCount} interactive elements detected]\n` + structuralLines.join('\n');
    }
}

export class ScriptPersistenceManager {
    static getScriptPath(outputDir: string, sessionId: string): string {
        const scriptsDir = path.join(outputDir, 'scripts');
        return path.join(scriptsDir, `${sessionId}_script.js`);
    }

    static async loadPersistedScript(outputDir: string, sessionId: string): Promise<string | null> {
        try {
            const scriptPath = ScriptPersistenceManager.getScriptPath(outputDir, sessionId);
            const script = await fs.readFile(scriptPath, 'utf-8');
            return script.trim() ? script : null;
        } catch {
            return null;
        }
    }

    static async saveScript(outputDir: string, sessionId: string, scriptContent: string): Promise<string> {
        const scriptsDir = path.join(outputDir, 'scripts');
        await fs.mkdir(scriptsDir, { recursive: true });
        const scriptPath = ScriptPersistenceManager.getScriptPath(outputDir, sessionId);
        await fs.writeFile(scriptPath, scriptContent, 'utf-8');
        return scriptPath;
    }
}

export class IntelligentBrowserScraper {
    private llmCaller?: (messages: { role: string; content: string }[]) => Promise<string>;

    constructor(customLLMCaller?: (messages: { role: string; content: string }[]) => Promise<string>) {
        this.llmCaller = customLLMCaller;
    }

    static parseDevToolsEvalOutput(rawResponse: any): any {
        try {
            if (Array.isArray(rawResponse)) return rawResponse;
            const textContent = rawResponse?.content?.find((c: any) => c.type === 'text')?.text || '';
            const match = textContent.match(/```json\n([\s\S]*?)\n```/);
            if (match && match[1]) {
                const jsonString = JSON.parse(match[1]);
                return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
            }
        } catch {}
        return null;
    }

    private async callLLM(messages: { role: string; content: string }[]): Promise<string> {
        if (this.llmCaller) {
            return this.llmCaller(messages);
        }
        try {
            const availableProviders = ProviderRegistry.getInstance().getAvailableProviders();
            for (const provider of availableProviders) {
                try {
                    const modelId = provider.models[0]?.id;
                    if (!modelId) continue;
                    const response = await provider.chat({
                        model: modelId,
                        messages: messages.map(m => ({ role: m.role as any, content: m.content }))
                    });
                    const content = response.choices?.[0]?.message?.content;
                    if (content) {
                        const text = getMessageContent(content);
                        if (text.trim().length > 0) return text;
                    }
                } catch (pErr: any) {
                    console.warn(`[LLMCall] Provider ${provider.id} attempt note:`, pErr?.message || pErr);
                }
            }
        } catch (err: any) {
            console.warn('[LLMCall] General provider lookup note:', err?.message || err);
        }
        return '';
    }

    async exploreSurfaceArea(mcpClient: any, targetUrl: string, domainContext: string): Promise<{
        snapshotText: string;
        domFingerprint: string;
        discoveredSections: string[];
    }> {
        console.log(`🌐 [Surface Exploration] Exploring full surface area of ${targetUrl}...`);

        await mcpClient.callTool({
            name: 'navigate_page',
            arguments: { url: targetUrl }
        });

        await new Promise(r => setTimeout(r, 6000));

        try {
            await mcpClient.callTool({
                name: 'evaluate_script',
                arguments: {
                    function: '() => { window.scrollTo(0, 1000); return "Scrolled 1000px"; }'
                }
            });
            await new Promise(r => setTimeout(r, 3000));
        } catch {}

        const snapshotResult: any = await mcpClient.callTool({
            name: 'take_snapshot',
            arguments: { verbose: false }
        });

        const snapshotText = snapshotResult?.content?.[0]?.text || '';
        const domFingerprint = DomStateFingerprinter.computeHash(snapshotText);

        const lines = snapshotText.split('\n');
        const sections: string[] = [];
        for (const l of lines) {
            const t = l.trim();
            if (t.includes('heading') || t.includes('tab') || t.includes('Filter') || t.includes('Trending') || t.includes('Section') || t.includes('Group') || t.includes('Item')) {
                sections.push(t.slice(0, 60));
                if (sections.length >= 10) break;
            }
        }

        console.log(`📸 [Surface Exploration Complete] Fingerprint: ${domFingerprint}, Discovered ${sections.length} sections.`);
        const res = { targetUrl, domFingerprint, discoveredSectionsCount: sections.length, discoveredSections: sections };
        await logToolCall('browser_explore_session', 'browser_tool:explore_surface_area', { targetUrl, domainContext }, res, 0, false).catch(() => {});
        return {
            snapshotText,
            domFingerprint,
            discoveredSections: sections
        };
    }

    async generateExtractionScriptWithLLM(pageSnapshot: string, domainContext: string, userInstructions?: string): Promise<string> {
        const compressedDom = SemanticDomCompressor.compressSnapshot(pageSnapshot);
        const goalPrompt = userInstructions || 'Extract all repeating data cards with titles, key details, status/metrics, and links.';

        const systemPrompt = `You are an AI Web Automation & Universal Web Scraping Engineer.
Target Context: ${domainContext}
Target Goal: ${goalPrompt}

Analyze the grounded DOM structure snapshot provided below and write a JavaScript function string to evaluate inside Chrome DevTools via evaluate_script.

CRITICAL REQUIREMENTS:
1. The JS function MUST be a valid anonymous arrow function declaration: "() => { ... return JSON.stringify(results); }"
2. Analyze the DOM nodes to locate repeating item/card/link containers.
3. For each repeating element, extract text lines and links (e.g., el.href or el.getAttribute('href')).
4. Return a stringified JSON array of objects, where each object has: { href: string, lines: string[] }.
5. Output ONLY the JavaScript function code. Do NOT wrap in markdown codeblocks.`;

        const userPrompt = `DOM Grounding Snapshot:\n${compressedDom}`;

        const code = await this.callLLM([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]);

        const cleanCode = code.replace(/```javascript/g, '').replace(/```js/g, '').replace(/```/g, '').trim();
        if (cleanCode.includes('() =>') || cleanCode.includes('function')) {
            return cleanCode;
        }

        return `() => {
            const elements = Array.from(document.querySelectorAll('a[href]'));
            const matches = elements.map(el => {
                const href = el.href || el.getAttribute('href') || '';
                const text = (el.innerText || el.textContent || '').trim();
                const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
                return { href, lines };
            }).filter(i => i.lines.length >= 1);
            return JSON.stringify(matches.slice(0, 35));
        }`;
    }

    async interpretExtractedDataWithLLM(
        extractedItems: any[],
        domainContext: string,
        userInstructions?: string
    ): Promise<Record<string, any>[]> {
        if (!extractedItems || extractedItems.length === 0) return [];

        const systemPrompt = `You are a universal AI Web Data Normalizer.
Web Context: ${domainContext}
Target Schema: ${userInstructions || 'Extract structured records with clean, meaningful field names.'}

Analyze the provided raw extracted text lines from the web DOM.
Infer domain fields dynamically based on the web context (e.g., entity names, scores, values, status, metrics, links).
Separate multi-part text lines accurately into their respective field attributes.

Output ONLY a valid JSON array of standardized objects. Do not wrap in markdown codeblocks.`;

        const sampleBatch = extractedItems.slice(0, 30);
        const userPrompt = `Raw extracted DOM elements:\n${JSON.stringify(sampleBatch, null, 2)}`;

        const rawText = await this.callLLM([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]);

        const match = rawText.match(/\[[\s\S]*\]/);
        if (match) {
            try {
                const parsed = JSON.parse(match[0]);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((item, idx) => ({ id: idx + 1, ...item }));
                }
            } catch {}
        }

        return sampleBatch.map((item, idx) => ({
            id: idx + 1,
            title: (item.lines || []).join(' | '),
            link: item.href || ''
        }));
    }

    async deepScrapeMatchDetails(mcpClient: any, parentRecords: Record<string, any>[], domainContext: string, limit: number = 2): Promise<Record<string, any>[]> {
        return this.deepScrapeItemDetails(mcpClient, parentRecords, domainContext, limit);
    }

    async deepScrapeItemDetails(
        mcpClient: any,
        parentRecords: Record<string, any>[],
        domainContext: string,
        limit: number = 2
    ): Promise<Record<string, any>[]> {
        const validLinks = parentRecords
            .filter(r => r.link && (r.link.includes('/match/') || r.link.includes('/event/') || r.link.includes('/item/') || r.link.includes('/product/')))
            .slice(0, limit);

        if (validLinks.length === 0) return [];

        const deepResults: Record<string, any>[] = [];

        for (let i = 0; i < validLinks.length; i++) {
            const record = validLinks[i];
            console.log(`   🔎 [Deep Scrape ${i + 1}/${validLinks.length}] Navigating into ${record.link}...`);

            try {
                await mcpClient.callTool({
                    name: 'navigate_page',
                    arguments: { url: record.link }
                });

                await new Promise(r => setTimeout(r, 6000));

                try {
                    await mcpClient.callTool({
                        name: 'evaluate_script',
                        arguments: {
                            function: `() => {
                                const elements = Array.from(document.querySelectorAll('button, div[role="tab"], div[class*="tab"]'));
                                for (let i = 0; i < elements.length; i++) {
                                    const role = elements[i].getAttribute('role') || '';
                                    const cls = (elements[i].className || '').toString();
                                    if (role === 'tab' || cls.includes('tab') || elements[i].tagName.toLowerCase() === 'button') {
                                        elements[i].click();
                                    }
                                }
                                return "Clicked interactive detail tabs structurally";
                            }`
                        }
                    });
                    await new Promise(r => setTimeout(r, 3500));
                } catch {}

                const snapshotResult: any = await mcpClient.callTool({
                    name: 'take_snapshot',
                    arguments: { verbose: false }
                });

                const snapshotText = snapshotResult?.content?.[0]?.text || '';
                const topRelatableBlocks = SemanticDomCompressor.extractTopRelatableBlocks(snapshotText, 5);

                const prompt = `You are a universal deep data analyst.
Web Context: ${domainContext}
Target Detail Page: ${record.link}

Analyze the provided relatable DOM detail blocks.
Extract structured deep details:
- entityRatings: Array of sub-entity ratings or participant scores (e.g. { name: string, rating: string, link: string })
- primaryDetails: Key metadata, categories, status, venue/location, or specifications
Output a valid JSON object. Do not include markdown codeblocks.`;

                const rawLlmResp = await this.callLLM([
                    { role: 'system', content: prompt },
                    { role: 'user', content: `Relatable DOM Blocks:\n${JSON.stringify(topRelatableBlocks, null, 2)}` }
                ]);

                let deepStats: Record<string, any> = {};
                try {
                    const matchJson = rawLlmResp.match(/\{[\s\S]*\}/);
                    if (matchJson) deepStats = JSON.parse(matchJson[0]);
                } catch {}

                deepResults.push({
                    parentId: record.id || i + 1,
                    parentTitle: record.title || `${record.homeTeam || record.team1 || 'Entity'} vs ${record.awayTeam || record.team2 || 'Target'}`,
                    itemLink: record.link,
                    relatableBlocksCount: topRelatableBlocks.length,
                    deepDetails: Object.keys(deepStats).length > 0 ? deepStats : { topExtractedLines: topRelatableBlocks }
                });

            } catch (err: any) {
                console.warn(`   ⚠️ Deep scrape note for ${record.link}:`, err?.message || err);
            }
        }

        return deepResults;
    }

    async scrapeAndProcess(input: BrowserScrapeInput, devtoolsEvalResponse: any, mcpClient?: any): Promise<ScrapeResult> {
        return this.scrapeAndProcessWithCheckpoint(input, devtoolsEvalResponse, mcpClient);
    }

    async scrapeAndProcessWithCheckpoint(input: BrowserScrapeInput, devtoolsEvalResponse: any, mcpClient?: any): Promise<ScrapeResult> {
        try {
            const outputDir = input.outputDir || path.join(process.cwd(), 'data', 'scrapes');

            if (input.action === 'list_checkpoints' || input.url === 'list_checkpoints') {
                const checkpoints = await ScrapingSessionCheckpointManager.listCheckpoints(outputDir);
                return {
                    success: true,
                    url: 'list_checkpoints',
                    domainContext: 'Checkpoint Manager',
                    recordCount: checkpoints.length,
                    totalAccumulatedRecords: checkpoints.length,
                    deepRecordCount: 0,
                    sampleRecords: checkpoints as any,
                    usedPersistedScript: false
                };
            }

            const rawItems = IntelligentBrowserScraper.parseDevToolsEvalOutput(devtoolsEvalResponse) || [];
            const domainContext = input.domainContext || 'Web Page Data';
            const sessionId = input.sessionId || `session_${domainContext.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

            let checkpoint = await ScrapingSessionCheckpointManager.loadCheckpoint(outputDir, sessionId);

            if (!checkpoint) {
                checkpoint = {
                    sessionId,
                    targetUrl: input.url,
                    domainContext,
                    status: 'INITIALIZED',
                    currentPage: 1,
                    visitedUrls: [input.url],
                    pendingUrlQueue: [],
                    domStateFingerprint: '',
                    accumulatedRecords: [],
                    deepRecords: [],
                    discoveredNodes: [],
                    discoveredSections: [],
                    lastUpdated: new Date().toISOString()
                };
            }

            const newRecords = await this.interpretExtractedDataWithLLM(
                Array.isArray(rawItems) ? rawItems : [],
                domainContext,
                input.userInstructions
            );

            const getItemKey = (r: Record<string, any>) => r.link || r.title || r.team1 || r.homeTeam || r.entityName || JSON.stringify(r);
            const existingKeys = new Set(checkpoint.accumulatedRecords.map(getItemKey));
            for (const r of newRecords) {
                const key = getItemKey(r);
                if (key && !existingKeys.has(key)) {
                    checkpoint.accumulatedRecords.push(r);
                    existingKeys.add(key);
                }
            }

            if (mcpClient && input.deepScrapeLimit && input.deepScrapeLimit > 0) {
                console.log(`\n🔗 [Deep Scraping Pass] Navigating into extracted href links (Limit: ${input.deepScrapeLimit})...`);
                const newDeepRecords = await this.deepScrapeItemDetails(mcpClient, checkpoint.accumulatedRecords, domainContext, input.deepScrapeLimit);
                
                for (const dr of newDeepRecords) {
                    if (!checkpoint.deepRecords.some(existing => existing.itemLink === dr.itemLink)) {
                        checkpoint.deepRecords.push(dr);
                    }
                }
            }

            checkpoint.status = 'COMPLETED';
            const checkpointPath = await ScrapingSessionCheckpointManager.saveCheckpoint(outputDir, checkpoint);

            const filenameBase = input.filenameBase || `scrape_${domainContext.toLowerCase().replace(/[^a-z0-9]/g, '_')}_continuous`;

            const jsonPath = await ScraperExporter.exportToJSON(checkpoint.accumulatedRecords, {
                outputDir,
                filenameBase,
                sourceUrl: input.url
            });

            const csvPath = await ScraperExporter.exportToCSV(checkpoint.accumulatedRecords, {
                outputDir,
                filenameBase,
                sourceUrl: input.url
            });

            let deepJsonPath: string | undefined;
            let deepCsvPath: string | undefined;

            if (checkpoint.deepRecords.length > 0) {
                deepJsonPath = await ScraperExporter.exportToJSON(checkpoint.deepRecords, {
                    outputDir,
                    filenameBase: `${filenameBase}_deep`,
                    sourceUrl: input.url
                });

                deepCsvPath = await ScraperExporter.exportToCSV(checkpoint.deepRecords, {
                    outputDir,
                    filenameBase: `${filenameBase}_deep`,
                    sourceUrl: input.url
                });
            }

            const res = {
                success: true,
                url: input.url,
                domainContext,
                recordCount: newRecords.length,
                totalAccumulatedRecords: checkpoint.accumulatedRecords.length,
                deepRecordCount: checkpoint.deepRecords.length,
                jsonPath,
                csvPath,
                deepJsonPath,
                deepCsvPath,
                checkpointPath,
                sampleRecords: checkpoint.accumulatedRecords.slice(0, 5),
                sampleDeepRecords: checkpoint.deepRecords.slice(0, 3),
                usedPersistedScript: false
            };
            await logToolCall(sessionId, 'browser_tool:scrape', input, res, 0, false).catch(() => {});
            return res;
        } catch (err: any) {
            const errRes = {
                success: false,
                url: input.url,
                domainContext: input.domainContext || 'Web Page Data',
                recordCount: 0,
                totalAccumulatedRecords: 0,
                deepRecordCount: 0,
                sampleRecords: [],
                usedPersistedScript: false,
                error: err?.message || String(err)
            };
            const sid = input.sessionId || 'browser_tool_session';
            await logToolCall(sid, 'browser_tool:scrape', input, errRes, 0, true).catch(() => {});
            return errRes;
        }
    }
}

export const PlayerCardExplorerEngine = DynamicNodeAnalyzer;
