import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const ALGORITHM = 'aes-256-gcm';

// Resolve key path: ~/.free-llm-mcp/.key
function getKeyPath(): string {
    return path.join(os.homedir(), '.free-llm-mcp', '.key');
}

// Memoized in-process so repeated encrypt()/decrypt() calls don't re-read
// disk each time — also avoids two calls within the same process ever
// disagreeing on which key is in use.
let cachedKey: Buffer | null = null;
let keyLoadPromise: Promise<Buffer> | null = null;

// Get or create the secret key
async function getSecretKey(): Promise<Buffer> {
    if (cachedKey) return cachedKey;
    if (keyLoadPromise) return keyLoadPromise;

    keyLoadPromise = (async () => {
        let keyBuffer: Buffer;

        if (process.env.MCP_SECRET_KEY) {
            keyBuffer = Buffer.from(process.env.MCP_SECRET_KEY, 'hex');
        } else {
            const keyPath = getKeyPath();
            if (await fs.pathExists(keyPath)) {
                const hexKey = await fs.readFile(keyPath, 'utf8');
                keyBuffer = Buffer.from(hexKey.trim(), 'hex');
            } else {
                // Generate a random 32-byte key, written via a uniquely-named tmp
                // file + rename. fs.move's overwrite:false guard is a check-then-act
                // (stat, then rename) — not atomic — so two processes racing on a
                // still-missing key file can both pass that check and both rename;
                // the loser's promise won't necessarily reject. Rather than trust
                // whichever branch we took, always read back whatever bytes are
                // actually on disk after the write, so every racing process
                // converges on the one value that ultimately landed there.
                const key = crypto.randomBytes(32);
                const hexKey = key.toString('hex');

                await fs.ensureDir(path.dirname(keyPath));
                const tmpPath = `${keyPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
                await fs.writeFile(tmpPath, hexKey, { mode: 0o600, encoding: 'utf8' });
                try {
                    await fs.move(tmpPath, keyPath, { overwrite: false });
                } catch {
                    await fs.remove(tmpPath).catch(() => {});
                }
                const hexKeyOnDisk = await fs.readFile(keyPath, 'utf8');
                keyBuffer = Buffer.from(hexKeyOnDisk.trim(), 'hex');
            }
        }

        if (keyBuffer.length !== 32) {
            throw new Error(`Invalid secret key length: Expected 32 bytes, got ${keyBuffer.length} bytes.`);
        }

        cachedKey = keyBuffer;
        return keyBuffer;
    })();

    try {
        return await keyLoadPromise;
    } finally {
        keyLoadPromise = null;
    }
}

export async function encrypt(plaintext: string): Promise<string> {
    const key = await getSecretKey();
    const iv = crypto.randomBytes(12); // 12 bytes standard for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag().toString('hex');
    
    return JSON.stringify({
        iv: iv.toString('hex'),
        tag: tag,
        data: encrypted
    });
}

export async function decrypt(encryptedJson: string): Promise<string> {
    try {
        const key = await getSecretKey();
        const payload = JSON.parse(encryptedJson);
        if (!payload.iv || !payload.tag || !payload.data) {
            throw new Error('Invalid encrypted JSON payload format');
        }

        const iv = Buffer.from(payload.iv, 'hex');
        const tag = Buffer.from(payload.tag, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(payload.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
}
