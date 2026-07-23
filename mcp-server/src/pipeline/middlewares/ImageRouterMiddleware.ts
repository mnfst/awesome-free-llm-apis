import { Middleware, PipelineContext, NextFunction } from '../middleware.js';
import { LLMExecutor } from '../../utils/LLMExecutor.js';
import { ProviderRegistry } from '../../providers/registry.js';
import { getModelCapability } from '../../config/models.js';
import { isUserConfused, getMessageContent, appendToMessageContent } from '../../utils/MessageUtils.js';
import { promises as fs } from 'fs';
import path from 'path';

export class ImageRouterMiddleware implements Middleware {
    name = 'ImageRouterMiddleware';
    private executor: LLMExecutor;

    constructor(executor?: LLMExecutor) {
        this.executor = executor || new LLMExecutor();
    }

    private calculateTotalImageSize(messages: any[]): number {
        let totalSize = 0;
        if (!messages || !Array.isArray(messages)) return 0;
        for (const msg of messages) {
            if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    if (item?.type === 'image_url' && typeof item.image_url?.url === 'string') {
                        const url = item.image_url.url;
                        if (url.startsWith('data:image/')) {
                            const base64Data = url.split(',')[1] || '';
                            totalSize += Math.round(base64Data.length * 0.75);
                        }
                    }
                }
            } else if (typeof msg.content === 'string' && msg.content.startsWith('data:image/')) {
                const base64Data = msg.content.split(',')[1] || '';
                totalSize += Math.round(base64Data.length * 0.75);
            }
        }
        return totalSize;
    }

    public async processImageMessages(messages: any[], workspaceRoot?: string): Promise<any[]> {
        if (!messages || !Array.isArray(messages)) return messages;

        const processed: any[] = [];
        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                processed.push(await this.processStringContent(msg.content, msg, workspaceRoot));
            } else if (Array.isArray(msg.content)) {
                const newContent: any[] = [];
                for (const item of msg.content) {
                    if (item && typeof item === 'object' && item.type === 'image_url' && item.image_url?.url) {
                        const imgUrl = item.image_url.url;
                        if (imgUrl.startsWith('file:///')) {
                            const base64Url = await this.convertFileUrlToBase64(imgUrl, workspaceRoot);
                            if (base64Url) {
                                newContent.push({
                                    type: 'image_url',
                                    image_url: { url: base64Url }
                                });
                            } else {
                                newContent.push(item);
                            }
                        } else {
                            newContent.push(item);
                        }
                    } else {
                        newContent.push(item);
                    }
                }
                processed.push({ ...msg, content: newContent });
            } else {
                processed.push(msg);
            }
        }
        return processed;
    }

    private async processStringContent(content: string, msg: any, workspaceRoot?: string): Promise<any> {
        const fileRegex = /file:\/\/\/\S+/g;
        const matches = [...content.matchAll(fileRegex)];

        if (matches.length === 0) {
            return msg;
        }

        const newContent: any[] = [];
        let lastIndex = 0;

        for (const match of matches) {
            const [fullMatch, fileUrl] = match;
            const matchIndex = match.index!;

            if (matchIndex > lastIndex) {
                newContent.push({ type: 'text', text: content.substring(lastIndex, matchIndex) });
            }

            const base64Url = await this.convertFileUrlToBase64(fileUrl, workspaceRoot);
            if (base64Url) {
                newContent.push({
                    type: 'image_url',
                    image_url: { url: base64Url }
                });
            } else {
                newContent.push({ type: 'text', text: fullMatch });
            }

            lastIndex = matchIndex + fullMatch.length;
        }

        if (lastIndex < content.length) {
            newContent.push({ type: 'text', text: content.substring(lastIndex) });
        }

        return { ...msg, content: newContent };
    }

    private async convertFileUrlToBase64(imgUrl: string, workspaceRoot?: string): Promise<string | null> {
        let decodedPath = decodeURIComponent(imgUrl.replace(/^file:\/\//, ''));
        if (process.platform === 'win32' && decodedPath.startsWith('/') && /^\/[A-Za-z]:/.test(decodedPath)) {
            decodedPath = decodedPath.substring(1);
        }
        const imageFsPath = path.resolve(decodedPath);

        // Path Traversal and Arbitrary File Read protection
        if (workspaceRoot) {
            const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
            const relative = path.relative(resolvedWorkspaceRoot, imageFsPath);
            const isInside = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
            if (!isInside && imageFsPath !== resolvedWorkspaceRoot) {
                console.warn(`[ImageRouterMiddleware] Security alert: Rejected file read outside workspace root: ${imageFsPath}`);
                return null;
            }
        }

        try {
            const buffer = await fs.readFile(imageFsPath);
            const ext = path.extname(imageFsPath).toLowerCase().replace('.', '');
            const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];

            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                console.warn(`[ImageRouterMiddleware] Unsupported image extension: .${ext}`);
                return null;
            }

            const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
            const base64Data = buffer.toString('base64');
            return `data:${mimeType};base64,${base64Data}`;
        } catch (err: any) {
            console.error(`[ImageRouterMiddleware] Error reading local image file ${imageFsPath}:`, err.message);
            return null;
        }
    }

    private hasImageContent(messages: any[]): boolean {
        if (!messages || !Array.isArray(messages)) return false;
        const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
        for (const msg of messages) {
            if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    if (item && typeof item === 'object' && (item.type === 'image_url' || item.image_url)) {
                        return true;
                    }
                }
            } else if (typeof msg.content === 'string') {
                if (msg.content.includes('data:image/')) {
                    return true;
                }
                const fileMatches = msg.content.match(/file:\/\/\/\S+/g);
                if (fileMatches) {
                    for (const url of fileMatches) {
                        const ext = url.split('.').pop()?.toLowerCase().split(/[?#]/)[0] || '';
                        if (ALLOWED_EXTENSIONS.includes(ext)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    async execute(context: PipelineContext, next: NextFunction): Promise<void> {
        // Only intercept if there's image content in the messages
        if (!this.hasImageContent(context.request.messages)) {
            return await next();
        }

        console.debug('[ImageRouter] Intercepted vision request. Selecting vision models...');

        // Dynamic base64 image path resolution before forwarding to LLM execution
        const workspaceRoot = context.workspaceRoot || (context.request as any)?.workspace_root;
        context.request.messages = await this.processImageMessages(context.request.messages, workspaceRoot);

        // Detect if user is confused (e.g. image-only upload, or default boilerplate instructions)
        let userPrompt = '';
        if (context.request.messages && Array.isArray(context.request.messages)) {
            for (const msg of context.request.messages) {
                if (msg.role === 'user' && msg.content) {
                    userPrompt += getMessageContent(msg) + ' ';
                }
            }
        }
        const confused = isUserConfused(userPrompt);

        if (confused) {
            console.debug('[ImageRouter] Confused user state detected (no clear prompt or boilerplate prompt).');

            // Prepend system note to inform the model and ask it to guide the user
            const confusedInstruction = "\n[System Note: The user has not provided a clear request or instructions. They might be confused or just uploading/sharing files. Please guide them on what they can do next with these files/images, summarize the contents briefly, and ask what they would like to do.]";
            if (context.request.messages && context.request.messages.length > 0) {
                const userMsg = context.request.messages.find(m => m.role === 'user');
                if (userMsg) {
                    appendToMessageContent(userMsg, confusedInstruction);
                }
            }
        }

        // Standalone testing mode: resolve paths but skip routing overrides to allow direct targeting of individual models
        if (context.bypassImageRouter) {
            console.debug('[ImageRouter] Bypassing routing fallback selection because bypassImageRouter is active.');
            return await next();
        }

        const requestedModel = context.request.model;
        const registry = ProviderRegistry.getInstance();
        const availableProviders = registry.getAvailableProviders();

        let candidateModels = [...new Set(registry.getAvailableVisionModels().map(({ model }) => model.id))];

        // Prioritize requested model if it's a known vision model
        if (requestedModel && requestedModel !== 'any') {
            if (candidateModels.includes(requestedModel)) {
                candidateModels = [requestedModel, ...candidateModels.filter(m => m !== requestedModel)];
            } else {
                candidateModels = [requestedModel, ...candidateModels];
            }
        }

        const totalImageSize = this.calculateTotalImageSize(context.request.messages);
        console.debug(`[ImageRouter] Total image size detected: ${(totalImageSize / 1024).toFixed(1)} KB`);

        // Hard limit of 20 MB to prevent buffer overflow (common VLM baseline)
        const maxImageSizeBytes = 20 * 1024 * 1024;
        if (totalImageSize > maxImageSizeBytes) {
            console.error(`[ImageRouter] Image payload of ${(totalImageSize / (1024 * 1024)).toFixed(1)} MB exceeds the hard limit of 20 MB.`);
            context.response = {
                id: `rejected-image-${Date.now()}`,
                choices: [
                    {
                        message: {
                            role: 'assistant',
                            content: `⚠️ **Error: Image size is over the allowed size.**\n\nThe total image size of **${(totalImageSize / (1024 * 1024)).toFixed(1)} MB** exceeds the system limit of **20 MB**. Please compress the image or use a smaller resolution.`
                        },
                        finish_reason: 'stop',
                        index: 0
                    }
                ],
                model: 'none',
                object: 'chat.completion',
                created: Date.now()
            };
            return;
        }

        // Sort candidates based on capability score: descending (try best first) for large images (> 50KB),
        // and ascending (try faster/cheaper first) for small images. Try cheaper/faster models first if confused.
        const thresholdBytes = 50 * 1024;
        candidateModels.sort((a, b) => {
            const scoreA = getModelCapability(a);
            const scoreB = getModelCapability(b);
            if (confused) {
                return scoreA - scoreB; // Ascending capability score (cheaper first)
            }
            return totalImageSize > thresholdBytes ? scoreB - scoreA : scoreA - scoreB;
        });

        if (availableProviders.length === 0) {
            throw new Error('No available providers for vision routing.');
        }

        const startTime = Date.now();
        const totalBudget = context.request.timeoutMs || 60000;
        const getRemainingTimeout = () => {
            const elapsed = Date.now() - startTime;
            return Math.max(0, totalBudget - elapsed);
        };

        let lastError: Error | null = null;
        const triedModels: string[] = [];

        for (const modelId of candidateModels) {
            const providersWithModel = availableProviders.filter(p =>
                (p.visionModels && p.visionModels.some(m => m.id === modelId)) ||
                p.models.some(m => m.id === modelId)
            );

            if (providersWithModel.length === 0) {
                continue;
            }

            triedModels.push(modelId);
            for (const provider of providersWithModel) {
                try {
                    const remainingTimeout = getRemainingTimeout();
                    if (remainingTimeout <= 1000) {
                        throw new Error('Timeout budget exhausted during vision fallback execution.');
                    }

                    console.debug(`[ImageRouter] Attempting vision model "${modelId}" on provider "${provider.name}"...`);

                    const res = await this.executor.tryProvider(
                        context,
                        provider.id,
                        modelId,
                        remainingTimeout
                    );

                    console.debug(`[ImageRouter] Successfully executed vision task using "${modelId}" via "${provider.name}".`);
                    context.response = res ?? undefined;
                    return;
                } catch (err: any) {
                    console.error(`[ImageRouter] Model "${modelId}" on "${provider.name}" failed: ${err.message}`);
                    lastError = err;
                }
            }
        }

        throw new Error(`[ImageRouter] Failed to execute vision request on any available vision model. Tried models: ${triedModels.join(', ')}. Last error: ${lastError?.message}`);
    }
}
