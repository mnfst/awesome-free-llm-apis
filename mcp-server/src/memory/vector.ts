import { pipeline } from '@huggingface/transformers';
import crypto from 'crypto';
import { LocalIndex, QueryResult } from 'vectra';
import path from 'path';
import fs from 'fs/promises';
import { withFileLock } from '../utils/file-lock.js';

import os from 'os';
import { config } from '../config/index.js';

// See long-term.ts for rationale: withFileLock() already reaps genuinely stuck/orphaned
// locks (dead holder or >30s old), so this only needs to be long enough that ordinary
// contention waits its turn instead of failing.
const LOCK_WAIT_MS = 30000;

export interface VectorEntry {
    id: string;
    content: string;
    metadata: any;
    embedding?: number[]; // Optional now as Vectra stores it
    contentHash: string;
    timestamp: number;
}

export class VectorStore {
    private embedder: any = null;
    private modelName = 'Xenova/bge-small-en-v1.5';
    private _storageRoot?: string;

    constructor(storageRoot?: string) {
        this._storageRoot = storageRoot;
    }

    get storageRoot(): string {
        return this._storageRoot || process.env.VECTOR_STORAGE_ROOT || config.vectorStorageRoot || path.join(os.homedir(), '.free-llm-mcp', 'data', 'vector-indices');
    }

    private async getEmbedder() {
        if (!this.embedder) {
            this.embedder = await pipeline('feature-extraction', this.modelName);
        }
        return this.embedder;
    }

    // NOTE: deliberately no per-workspace LocalIndex cache. Vectra's LocalIndex loads its
    // state into memory once and mutates it there — if we cached one instance per process,
    // a second process/worker writing to the same on-disk index would be invisible to us
    // (stale reads) and our own endUpdate() could clobber their write outright (silent data
    // loss, not even an error — this was the actual bug: search returning [] right after a
    // concurrent-process upsert). Constructing a fresh LocalIndex per operation, combined
    // with withFileLock() serializing access to the index directory, means every operation
    // both waits its turn AND starts from the current on-disk state.
    private async getIndex(workspaceHash: string): Promise<LocalIndex> {
        const indexPath = path.join(this.storageRoot, workspaceHash);
        const index = new LocalIndex(indexPath);

        if (!(await index.isIndexCreated())) {
            await fs.mkdir(indexPath, { recursive: true });
            await index.createIndex();
        }

        return index;
    }

    private lockPathFor(workspaceHash: string): string {
        return path.join(this.storageRoot, `${workspaceHash}.opslock`);
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const embedder = await this.getEmbedder();
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }

    calculateHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    async upsert(workspaceHash: string, entry: VectorEntry): Promise<void> {
        // Embedding generation doesn't touch the index — do it outside the lock.
        const embedding = entry.embedding || await this.generateEmbedding(entry.content);

        await fs.mkdir(this.storageRoot, { recursive: true });
        await withFileLock(this.lockPathFor(workspaceHash), async () => {
            const index = await this.getIndex(workspaceHash);
            // Vectra uses metadata to store the entry details
            // v1.0.5: Use upsertItem and endUpdate to ensure persistence
            await index.beginUpdate();
            try {
                await index.upsertItem({
                    id: entry.id, // CRITICAL: Pass ID at top level for vectra to replace existing items
                    vector: embedding,
                    metadata: {
                        content: entry.content,
                        contentHash: entry.contentHash,
                        timestamp: entry.timestamp,
                        ...entry.metadata
                    }
                });
                await index.endUpdate();
            } catch (error) {
                index.cancelUpdate();
                throw error;
            }
        }, LOCK_WAIT_MS);
    }

    async search(workspaceHash: string, query: string, limit: number = 5): Promise<VectorEntry[]> {
        const queryEmbedding = await this.generateEmbedding(query);

        await fs.mkdir(this.storageRoot, { recursive: true });
        return withFileLock(this.lockPathFor(workspaceHash), async () => {
            const index = await this.getIndex(workspaceHash);

            let results: QueryResult<any>[] = [];
            try {
                results = await index.queryItems(queryEmbedding, query, limit, undefined, false);
            } catch (err) {
                results = [];
            }

            return results.map((res: QueryResult<any>) => {
                const ts = (res.item.metadata?.timestamp as number) || Date.now();
                const daysSince = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
                const sourceCount = (res.item.metadata?.sourceCount as number) || 1;
                const isPinned = !!res.item.metadata?.pinned;
                const strength = 30 * (1 + 0.5 * sourceCount);
                const decayFactor = isPinned ? 1.0 : Math.exp(-daysSince / strength);

                return {
                    id: res.item.id as string,
                    content: res.item.metadata?.content as string,
                    contentHash: res.item.metadata?.contentHash as string,
                    timestamp: ts,
                    metadata: res.item.metadata,
                    score: res.score * decayFactor,
                    rawScore: res.score,
                    decayFactor
                } as any;
            });
        }, LOCK_WAIT_MS);
    }

    async deleteIndex(workspaceHash: string): Promise<void> {
        await withFileLock(this.lockPathFor(workspaceHash), async () => {
            const indexPath = path.join(this.storageRoot, workspaceHash);
            await fs.rm(indexPath, { recursive: true, force: true });
        }, LOCK_WAIT_MS);
    }
}

export const vectorStore = new VectorStore();
