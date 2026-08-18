import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

export class WorkspaceScanner {
    private hashes: Map<string, string> = new Map();

    constructor(private defaultProjectRoot: string) { }

    async getWorkspaceHash(projectRoot?: string): Promise<string> {
        const root = resolve(projectRoot || this.defaultProjectRoot);

        try {
            await fs.access(root);
        } catch {
            throw new Error(`Workspace root '${root}' does not exist on disk. Please provide a valid absolute directory path.`);
        }

        const normalizedRoot = process.platform === 'win32'
            ? root.replace(/\\/g, '/').toLowerCase()
            : root.replace(/\\/g, '/');

        const cached = this.hashes.get(normalizedRoot);
        if (cached) {
            return cached;
        }

        const hash = createHash('sha256');
        hash.update(normalizedRoot);

        const finalHash = hash.digest('hex');
        this.hashes.set(normalizedRoot, finalHash);
        this.hashes.set(root, finalHash);
        return finalHash;
    }
}
