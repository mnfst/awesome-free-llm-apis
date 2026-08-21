/**
 * The seam that makes BrowserSession testable without spawning Chrome.
 * StdioDevToolsClient talks to `chrome-devtools-mcp` (spawned as a child MCP
 * server over stdio) with the exact args already proven working in
 * scripts/smoke/test_tool_network_scraping_capabilities.ts:12-30.
 */
export interface DevToolsCallRequest {
    name: string;
    arguments?: Record<string, any>;
}

export interface DevToolsClient {
    callTool(req: DevToolsCallRequest): Promise<any>;
    close(): Promise<void>;
}

export interface StdioDevToolsClientOptions {
    /** Optional user-data-dir so a session can persist cookies/localStorage across restarts. */
    userDataDir?: string;
    /** Milliseconds to wait for the child process to accept the MCP handshake. */
    connectTimeoutMs?: number;
}

/**
 * Real implementation. Deliberately runs headed (no --headless) — the tool is meant
 * to be visually observable while it drives a scrape, matching how the SofaScore
 * debugging scripts (e.g. sofascore_interactive_debug.ts) were designed to run.
 */
export class StdioDevToolsClient implements DevToolsClient {
    private client: any;
    private transport: any;

    private constructor(client: any, transport: any) {
        this.client = client;
        this.transport = transport;
    }

    static async connect(opts: StdioDevToolsClientOptions = {}): Promise<StdioDevToolsClient> {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

        const args = ['-y', 'chrome-devtools-mcp', '--chrome-arg=--no-sandbox', '--allow-unrestricted-paths'];
        if (opts.userDataDir) {
            args.push(`--user-data-dir=${opts.userDataDir}`);
        }

        const transport = new StdioClientTransport({ command: 'npx', args });
        const client = new Client({ name: 'browser_tool', version: '2.0.0' }, { capabilities: {} });

        const timeoutMs = opts.connectTimeoutMs ?? 60_000;
        await Promise.race([
            client.connect(transport),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`chrome-devtools-mcp did not connect within ${timeoutMs}ms`)), timeoutMs)),
        ]);

        return new StdioDevToolsClient(client, transport);
    }

    static async connectCustom(opts: { command: string; args: string[]; connectTimeoutMs?: number }): Promise<StdioDevToolsClient> {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

        const transport = new StdioClientTransport({ command: opts.command, args: opts.args });
        const client = new Client({ name: 'custom_mcp_client', version: '1.0.0' }, { capabilities: {} });

        const timeoutMs = opts.connectTimeoutMs ?? 30_000;
        await Promise.race([
            client.connect(transport),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Custom MCP process (${opts.command}) did not connect within ${timeoutMs}ms`)), timeoutMs)),
        ]);

        return new StdioDevToolsClient(client, transport);
    }

    async callTool(req: DevToolsCallRequest): Promise<any> {
        return this.client.callTool({ name: req.name, arguments: req.arguments ?? {} });
    }

    async close(): Promise<void> {
        try {
            await this.client.close();
        } catch {
            // best-effort — process teardown must never throw
        }
    }
}

/** In-memory fake for tests — never spawns a process. */
export class FakeDevToolsClient implements DevToolsClient {
    public calls: DevToolsCallRequest[] = [];
    public closed = false;
    constructor(private handler: (req: DevToolsCallRequest) => any = () => ({ content: [{ type: 'text', text: '' }] })) {}

    async callTool(req: DevToolsCallRequest): Promise<any> {
        this.calls.push(req);
        return this.handler(req);
    }

    async close(): Promise<void> {
        this.closed = true;
    }
}
