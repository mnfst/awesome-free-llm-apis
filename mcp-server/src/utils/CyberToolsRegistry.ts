import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

export interface CyberToolsRegistryMap {
    [toolName: string]: string; // toolName -> githubUrl
}

export class CyberToolsRegistry {
    private static DEFAULT_REGISTRY: CyberToolsRegistryMap = {
        sqlmap: 'https://github.com/sqlmapproject/sqlmap',
        nmap: 'https://github.com/nmap/nmap',
        gobuster: 'https://github.com/OJ/gobuster',
        ffuf: 'https://github.com/ffuf/ffuf',
        nikto: 'https://github.com/sullo/nikto',
        hydra: 'https://github.com/vanhauser-thc/thc-hydra'
    };

    /**
     * Gets the target userprofile file path: ~/.free-llm-mcp/cyber-tools-registry.json
     */
    public static getRegistryFilePath(): string {
        const userHome = os.homedir();
        const configDir = path.join(userHome, '.free-llm-mcp');
        return path.join(configDir, 'cyber-tools-registry.json');
    }

    /**
     * Executes an operation wrapped inside a process-safe file lock (.lock)
     */
    private static async withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
        const lockPath = `${filePath}.lock`;
        const maxRetries = 10;
        const retryDelayMs = 100;

        let acquired = false;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // wx flag fails if file already exists (atomic lock)
                const handle = await fs.open(lockPath, 'wx');
                await handle.write(process.pid.toString());
                await handle.close();
                acquired = true;
                break;
            } catch (err: any) {
                if (err.code === 'EEXIST') {
                    // Check if lock file is stale (> 5 seconds old)
                    try {
                        const stat = await fs.stat(lockPath);
                        if (Date.now() - stat.mtimeMs > 5000) {
                            await fs.unlink(lockPath);
                        }
                    } catch {}
                    await new Promise(r => setTimeout(r, retryDelayMs));
                } else {
                    break;
                }
            }
        }

        try {
            return await fn();
        } finally {
            if (acquired) {
                try { await fs.unlink(lockPath); } catch {}
            }
        }
    }

    /**
     * Initializes and reads the cyber tools registry from the userprofile directory with file-lock synchronization.
     */
    public static async loadRegistry(): Promise<CyberToolsRegistryMap> {
        const filePath = this.getRegistryFilePath();
        const configDir = path.dirname(filePath);

        return await this.withFileLock(filePath, async () => {
            try {
                await fs.mkdir(configDir, { recursive: true });
                const exists = await fs.stat(filePath).then(() => true).catch(() => false);

                if (!exists) {
                    await fs.writeFile(filePath, JSON.stringify(this.DEFAULT_REGISTRY, null, 2), 'utf-8');
                    return { ...this.DEFAULT_REGISTRY };
                }

                const content = await fs.readFile(filePath, 'utf-8');
                const parsed = JSON.parse(content);
                return { ...this.DEFAULT_REGISTRY, ...parsed };
            } catch (err) {
                console.warn(`[CyberToolsRegistry] Failed to load registry from ${filePath}, using defaults:`, err);
                return { ...this.DEFAULT_REGISTRY };
            }
        });
    }

    /**
     * Adds or updates a cyber tool URL in the registry using file-lock synchronization.
     */
    public static async registerTool(toolName: string, githubUrl: string): Promise<CyberToolsRegistryMap> {
        const filePath = this.getRegistryFilePath();
        const configDir = path.dirname(filePath);

        return await this.withFileLock(filePath, async () => {
            await fs.mkdir(configDir, { recursive: true });
            let current = { ...this.DEFAULT_REGISTRY };

            try {
                const content = await fs.readFile(filePath, 'utf-8');
                current = { ...current, ...JSON.parse(content) };
            } catch {}

            current[toolName.toLowerCase()] = githubUrl;
            await fs.writeFile(filePath, JSON.stringify(current, null, 2), 'utf-8');
            return current;
        });
    }

    /**
     * Gets the list of active cyber tool names.
     */
    public static async getToolNames(): Promise<string[]> {
        const reg = await this.loadRegistry();
        return Object.keys(reg);
    }

    /**
     * Gets the GitHub repository URL for a given tool name.
     */
    public static async getToolGithubUrl(toolName: string): Promise<string | undefined> {
        const reg = await this.loadRegistry();
        return reg[toolName.toLowerCase()];
    }
}
