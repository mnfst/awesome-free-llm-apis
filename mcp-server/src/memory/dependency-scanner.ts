import fs from 'fs/promises';
import path from 'path';
import { extractEmbeddedSnippets, extractDefinedSymbols } from './embedded-snippet-scanner.js';

export interface Node {
    id: string;
    type: 'code' | 'doc' | 'concept' | 'external' | 'pdf';
    metadata?: {
        language?: string;
        size?: number;
        commands?: string[];
        title?: string;
        [key: string]: any;
    };
}

export interface Edge {
    source: string;
    target: string;
    type: 'imports' | 'references' | 'links' | 'invokes';
    /**
     * 'low' marks edges inferred without a literal import/require to anchor on (e.g.
     * calls between sibling embedded snippets, matched purely by symbol name within
     * the same parent file). Absent means the normal import-anchored precision applies.
     */
    confidence?: 'low';
}

export class RepositoryGraph {
    private nodes: Map<string, Node> = new Map();
    private edges: Edge[] = [];
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    addNode(id: string, type: 'code' | 'doc' | 'concept' | 'external' | 'pdf', metadata?: any) {
        const normalizedId = this.normalizeNodeId(id);
        this.nodes.set(normalizedId, { id: normalizedId, type, metadata });
    }

    getNode(id: string): Node | undefined {
        return this.nodes.get(this.normalizeNodeId(id));
    }

    getAllNodes(): Node[] {
        return Array.from(this.nodes.values());
    }

    addEdge(source: string, target: string, type: 'imports' | 'references' | 'links' | 'invokes', options?: { confidence?: 'low' }) {
        const normSource = this.normalizeNodeId(source);
        const normTarget = this.normalizeNodeId(target);

        // Prevent duplicate edges
        const exists = this.edges.some(
            e => e.source === normSource && e.target === normTarget && e.type === type
        );
        if (!exists) {
            this.edges.push({ source: normSource, target: normTarget, type, ...(options?.confidence ? { confidence: options.confidence } : {}) });
        }
    }

    getEdgesFrom(source: string): Edge[] {
        const normSource = this.normalizeNodeId(source);
        return this.edges.filter(e => e.source === normSource);
    }

    getAllEdges(): Edge[] {
        return this.edges;
    }

    private normalizeNodeId(id: string): string {
        // Normalize backslashes to forward slashes for cross-platform consistency
        let normalized = id.replace(/\\/g, '/');
        // Strip leading ./ if present
        if (normalized.startsWith('./')) {
            normalized = normalized.substring(2);
        }
        return normalized;
    }

    getNeighborhood(startNodeId: string, maxDepth: number = 2): { nodes: Node[]; edges: Edge[] } {
        const normStart = this.normalizeNodeId(startNodeId);
        const visited = new Set<string>([normStart]);
        const resultNodes: Node[] = [];
        const resultEdges: Edge[] = [];
        
        const startNode = this.getNode(normStart);
        if (startNode) {
            resultNodes.push(startNode);
        } else {
            // Fallback node if it doesn't exist
            resultNodes.push({ id: normStart, type: 'concept' });
        }

        let currentLevel = [normStart];

        for (let depth = 0; depth < maxDepth; depth++) {
            const nextLevel: string[] = [];
            for (const nodeId of currentLevel) {
                // Find all outgoing and incoming edges for context
                const connectedEdges = this.edges.filter(
                    e => e.source === nodeId || e.target === nodeId
                );

                for (const edge of connectedEdges) {
                    const neighbor = edge.source === nodeId ? edge.target : edge.source;
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        nextLevel.push(neighbor);
                        
                        const neighborNode = this.getNode(neighbor);
                        if (neighborNode) {
                            resultNodes.push(neighborNode);
                        } else {
                            resultNodes.push({ id: neighbor, type: neighbor.includes('.') ? 'code' : 'concept' });
                        }
                    }
                    
                    if (!resultEdges.some(re => re.source === edge.source && re.target === edge.target && re.type === edge.type)) {
                        resultEdges.push(edge);
                    }
                }
            }
            if (nextLevel.length === 0) break;
            currentLevel = nextLevel;
        }

        return { nodes: resultNodes, edges: resultEdges };
    }

    findNodeByKeyword(keyword: string): Node | null {
        const lowerKeyword = keyword.toLowerCase().trim();
        
        // Exact match first
        const exactNode = this.getNode(lowerKeyword);
        if (exactNode) return exactNode;

        // Substring match on node IDs
        for (const node of this.nodes.values()) {
            if (node.id.toLowerCase().includes(lowerKeyword)) {
                return node;
            }
        }
        return null;
    }

    serialize(): any {
        return {
            nodes: Array.from(this.nodes.entries()),
            edges: this.edges
        };
    }

    static deserialize(workspaceRoot: string, data: any): RepositoryGraph {
        const graph = new RepositoryGraph(workspaceRoot);
        if (data && Array.isArray(data.nodes)) {
            for (const [key, node] of data.nodes) {
                graph.nodes.set(key, node);
            }
        }
        if (data && Array.isArray(data.edges)) {
            graph.edges = data.edges;
        }
        return graph;
    }
}

/** Identifiers that are too common to be trustworthy invokes-edge signals without type/scope resolution. */
const CALL_SITE_KEYWORD_EXCLUSIONS = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'await', 'async',
    'const', 'let', 'var', 'class', 'import', 'export', 'require', 'this', 'super', 'console',
    'map', 'filter', 'reduce', 'forEach', 'then', 'push', 'pop', 'join', 'slice', 'split',
    'get', 'set', 'run', 'test', 'describe', 'it', 'expect', 'print', 'len', 'str', 'int', 'dict', 'list',
]);

export class WorkspaceDependencyScanner {
    private workspaceRoot: string;
    private workspaceFiles: Set<string> = new Set();
    /** Populated during scanFile() for JS/TS/Python files, reused by the invokes-edge pass to avoid re-reading files. */
    private fileContentCache: Map<string, string> = new Map();
    /** Populated during scanFile() for embedded snippets (snippetId -> code), reused by the snippet-family invokes pass. */
    private snippetContentCache: Map<string, string> = new Map();

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    async scanFile(filePath: string, graph: RepositoryGraph) {
        const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
        const ext = path.extname(filePath).toLowerCase();
        
        let fileContent = '';
        let stats;
        try {
            fileContent = await fs.readFile(filePath, 'utf8');
            stats = await fs.stat(filePath);
        } catch {
            return;
        }

        const currentDir = path.dirname(filePath);

        if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
            const exports = WorkspaceDependencyScanner.generateSemanticProfile(fileContent, ext).exports;
            graph.addNode(relativePath, 'code', { language: 'js/ts', size: stats.size, commands: [], exports });
            this.extractJsTsImports(fileContent, currentDir, relativePath, graph);
            this.extractCommandDocstrings(fileContent, relativePath, graph, ext);
            this.fileContentCache.set(relativePath, fileContent);
        } else if (ext === '.py') {
            const exports = WorkspaceDependencyScanner.generateSemanticProfile(fileContent, ext).exports;
            graph.addNode(relativePath, 'code', { language: 'python', size: stats.size, commands: [], exports });
            this.extractPythonImports(fileContent, currentDir, relativePath, graph);
            this.extractCommandDocstrings(fileContent, relativePath, graph, ext);
            this.fileContentCache.set(relativePath, fileContent);
        } else if (ext === '.go') {
            graph.addNode(relativePath, 'code', { language: 'go', size: stats.size, commands: [] });
            this.extractGoImports(fileContent, currentDir, relativePath, graph);
            this.extractCommandDocstrings(fileContent, relativePath, graph, ext);
        } else if (ext === '.rs') {
            graph.addNode(relativePath, 'code', { language: 'rust', size: stats.size, commands: [] });
            this.extractRustImports(fileContent, currentDir, relativePath, graph);
            this.extractCommandDocstrings(fileContent, relativePath, graph, ext);
        } else if (ext === '.md') {
            graph.addNode(relativePath, 'doc', { size: stats.size });
            this.extractMarkdownLinks(fileContent, relativePath, graph);
        } else if (ext === '.json' || ext === '.yml' || ext === '.yaml') {
            graph.addNode(relativePath, 'doc', { size: stats.size });
            this.extractEmbeddedSnippetNodes(fileContent, relativePath, graph, ext);
        }
    }

    private extractEmbeddedSnippetNodes(content: string, fileRelPath: string, graph: RepositoryGraph, ext: string) {
        let snippets;
        try {
            snippets = extractEmbeddedSnippets(content, ext as '.json' | '.yml' | '.yaml');
        } catch {
            return;
        }
        for (const snippet of snippets) {
            const snippetId = `${fileRelPath}#${snippet.fieldPath}`;
            // "exports" here means "top-level symbols this snippet defines" (see
            // extractDefinedSymbols) — snippet bodies are evaluated scripts, not
            // modules, so a real `export` scan would almost always come back empty.
            const exports = extractDefinedSymbols(snippet.code, snippet.language);
            graph.addNode(snippetId, 'code', {
                language: snippet.language,
                embeddedIn: fileRelPath,
                parentContext: snippet.parentContext,
                size: snippet.code.length,
                exports,
            });
            graph.addEdge(fileRelPath, snippetId, 'references');
            this.snippetContentCache.set(snippetId, snippet.code);
        }
    }

    private extractJsTsImports(content: string, currentDir: string, fileRelPath: string, graph: RepositoryGraph) {
        // import express from 'express' or import './middleware' or require('...')
        const patterns = [
            /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
            /import\s+['"]([^'"]+)['"]/g,
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1];
                this.resolveAndAddDependency(importPath, currentDir, fileRelPath, graph, ['.ts', '.tsx', '.js', '.jsx']);
            }
        }
    }

    private extractPythonImports(content: string, currentDir: string, fileRelPath: string, graph: RepositoryGraph) {
        // import os or from utils.helper import helper_func
        const importPattern = /^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm;
        const fromPattern = /^\s*from\s+(\.?\.?[a-zA-Z0-9_.]+)\s+import/gm;

        let match;
        while ((match = importPattern.exec(content)) !== null) {
            const modules = match[1].split(',');
            for (let mod of modules) {
                mod = mod.trim().split(/\s+/)[0];
                this.resolveAndAddDependency(mod, currentDir, fileRelPath, graph, ['.py', '/__init__.py']);
            }
        }

        while ((match = fromPattern.exec(content)) !== null) {
            const fromMod = match[1];
            this.resolveAndAddDependency(fromMod, currentDir, fileRelPath, graph, ['.py', '/__init__.py']);
        }
    }

    private extractGoImports(content: string, currentDir: string, fileRelPath: string, graph: RepositoryGraph) {
        // Single import "fmt" or grouped import ( ... )
        const singlePattern = /import\s+['"]([^'"]+)['"]/g;
        const groupPattern = /import\s*\(([\s\S]*?)\)/g;

        let match;
        while ((match = singlePattern.exec(content)) !== null) {
            this.resolveAndAddDependency(match[1], currentDir, fileRelPath, graph, ['.go']);
        }

        while ((match = groupPattern.exec(content)) !== null) {
            const lines = match[1].split('\n');
            for (const line of lines) {
                const lineMatch = /['"]([^'"]+)['"]/.exec(line);
                if (lineMatch) {
                    this.resolveAndAddDependency(lineMatch[1], currentDir, fileRelPath, graph, ['.go']);
                }
            }
        }
    }

    private extractRustImports(content: string, currentDir: string, fileRelPath: string, graph: RepositoryGraph) {
        // use std::collections::HashMap; use crate::models::user::User; extern crate rand;
        const usePattern = /use\s+([a-zA-Z0-9_:]+)/g;
        const externPattern = /extern\s+crate\s+([a-zA-Z0-9_]+)/g;

        let match;
        while ((match = usePattern.exec(content)) !== null) {
            const usePath = match[1];
            this.resolveAndAddDependency(usePath, currentDir, fileRelPath, graph, ['.rs', '/mod.rs']);
        }

        while ((match = externPattern.exec(content)) !== null) {
            graph.addNode(match[1], 'external');
            graph.addEdge(fileRelPath, match[1], 'imports');
        }
    }

    private extractMarkdownLinks(content: string, fileRelPath: string, graph: RepositoryGraph) {
        // [[ConceptName]] or [[file.md#Section]] or [[file.pdf#page=4]] or standard markdown links
        const wikiPattern = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = wikiPattern.exec(content)) !== null) {
            const target = match[1].trim();
            // Handle anchors and parameters
            const cleanTarget = target.split('#')[0];
            
            let nodeType: 'code' | 'doc' | 'concept' | 'pdf' = 'concept';
            if (cleanTarget.endsWith('.pdf')) {
                nodeType = 'pdf';
            } else if (cleanTarget.endsWith('.md')) {
                nodeType = 'doc';
            } else if (cleanTarget.includes('.') || cleanTarget.includes('/')) {
                nodeType = 'code';
            }

            graph.addNode(target, nodeType);
            graph.addEdge(fileRelPath, target, 'links');
        }
    }

    private extractCommandDocstrings(content: string, fileRelPath: string, graph: RepositoryGraph, ext: string) {
        // Scan for run commands inside comments/docstrings like "python run_pipeline.py"
        // Avoid crossing lines by using [ \t]+ instead of \s+ for options
        const commandRegex = /\b(python\d?|node|tsx|bun|go\s+run|cargo\s+run|npm\s+run)\b[ \t]+([a-zA-Z0-9_\-\.\/]+)(?:[ \t]+[a-zA-Z0-9_\-\.\/]+)*/gi;
        
        let match;
        const commands: string[] = [];
        while ((match = commandRegex.exec(content)) !== null) {
            const cmd = match[0].trim();
            if (!commands.includes(cmd)) {
                commands.push(cmd);
            }
        }

        if (commands.length > 0) {
            const node = graph.getNode(fileRelPath);
            if (node) {
                if (!node.metadata) node.metadata = {};
                node.metadata.commands = commands;
            }
            
            // Add self invokes edge or command nodes if desired
            for (const cmd of commands) {
                graph.addNode(cmd, 'concept');
                graph.addEdge(fileRelPath, cmd, 'invokes');
            }
        }
    }

    private resolveAndAddDependency(
        importPath: string, 
        currentDir: string, 
        fileRelPath: string, 
        graph: RepositoryGraph, 
        extensions: string[]
    ) {
        let targetId = importPath;

        // Rust crate imports
        if (importPath.startsWith('crate::')) {
            const relativeToCrate = importPath.substring(7).replace(/::/g, '/');
            const parts = relativeToCrate.split('/');
            const parentCrate = parts.slice(0, -1).join('/');

            const candidates = [
                'src/' + relativeToCrate,
                relativeToCrate,
                'src/' + parentCrate,
                parentCrate
            ];

            for (const cand of candidates) {
                if (cand) {
                    const resolved = this.findMatchingWorkspaceFile(cand, extensions);
                    if (resolved) {
                        graph.addEdge(fileRelPath, resolved, 'imports');
                        return;
                    }
                }
            }
        }

        // Relative path resolution (including Python dots relative resolution)
        let resolved: string | null = null;
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
            // Check if Python relative import style (e.g. .local_mod)
            if (importPath.startsWith('.') && !importPath.startsWith('./') && !importPath.startsWith('../')) {
                let dotCount = 0;
                while (importPath[dotCount] === '.') {
                    dotCount++;
                }
                const rest = importPath.substring(dotCount).replace(/\./g, '/');
                let targetDir = currentDir;
                for (let i = 1; i < dotCount; i++) {
                    targetDir = path.dirname(targetDir);
                }
                const absTarget = path.resolve(targetDir, rest);
                const relTarget = path.relative(this.workspaceRoot, absTarget).replace(/\\/g, '/');
                resolved = this.findMatchingWorkspaceFile(relTarget, extensions);
            } else {
                const absTarget = path.resolve(currentDir, importPath);
                const relTarget = path.relative(this.workspaceRoot, absTarget).replace(/\\/g, '/');
                resolved = this.findMatchingWorkspaceFile(relTarget, extensions);
            }

            if (resolved) {
                graph.addEdge(fileRelPath, resolved, 'imports');
                return;
            }
        }

        // Python style absolute imports like "utils.helper"
        const pythonStyle = importPath.replace(/\./g, '/');
        const resolvedPy = this.findMatchingWorkspaceFile(pythonStyle, extensions);
        if (resolvedPy) {
            graph.addEdge(fileRelPath, resolvedPy, 'imports');
            return;
        }

        // External module fallback
        graph.addNode(importPath, 'external');
        graph.addEdge(fileRelPath, importPath, 'imports');
    }

    private findMatchingWorkspaceFile(baseRelPath: string, extensions: string[]): string | null {
        // Normalize
        let normalized = baseRelPath.replace(/\\/g, '/');
        if (normalized.startsWith('./')) {
            normalized = normalized.substring(2);
        }

        // Check if exact matches exist
        if (this.workspaceFiles.has(normalized)) return normalized;

        // Strip known extension first before searching to handle imports that specify them (.js, etc)
        let baseWithoutExt = normalized;
        const extname = path.extname(normalized);
        if (extname && extensions.includes(extname)) {
            baseWithoutExt = normalized.slice(0, -extname.length);
        }

        for (const ext of extensions) {
            const candidate = baseWithoutExt + ext;
            if (this.workspaceFiles.has(candidate)) {
                return candidate;
            }
        }
        
        // Also check if it matches a folder index/init
        for (const ext of extensions) {
            if (ext.startsWith('/')) {
                const candidate = baseWithoutExt + ext;
                if (this.workspaceFiles.has(candidate)) {
                    return candidate;
                }
            }
        }
        
        return null;
    }

    async scanWorkspace(graph: RepositoryGraph) {
        // Collect all files in workspace first
        this.workspaceFiles.clear();
        this.fileContentCache.clear();
        this.snippetContentCache.clear();
        await this.collectWorkspaceFiles(this.workspaceRoot);

        for (const file of this.workspaceFiles) {
            const fullPath = path.join(this.workspaceRoot, file);
            await this.scanFile(fullPath, graph);
        }

        this.addInvokesEdges(graph);
        this.addSnippetInvokesEdges(graph);
    }

    /**
     * Heuristic cross-file call-edge builder: for each caller file, look for call-site
     * identifiers matching a known exported symbol. To keep the false-positive rate
     * manageable without type/scope resolution, an edge is only added when the defining
     * file is already a 1-hop import-neighbor of the caller (i.e. it's plausible the
     * symbol was actually imported, not just a same-named function elsewhere).
     */
    private addInvokesEdges(graph: RepositoryGraph) {
        const exportedSymbolToFiles = new Map<string, string[]>();
        for (const node of graph.getAllNodes()) {
            const exports: string[] = node.metadata?.exports || [];
            for (const sym of exports) {
                if (!exportedSymbolToFiles.has(sym)) exportedSymbolToFiles.set(sym, []);
                exportedSymbolToFiles.get(sym)!.push(node.id);
            }
        }
        if (exportedSymbolToFiles.size === 0) return;

        const callSiteRegex = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

        for (const [relativePath, content] of this.fileContentCache.entries()) {
            const importedFiles = new Set(
                graph.getEdgesFrom(relativePath).filter(e => e.type === 'imports').map(e => e.target)
            );
            if (importedFiles.size === 0) continue;

            const seen = new Set<string>();
            let match;
            while ((match = callSiteRegex.exec(content)) !== null) {
                const symbol = match[1];
                if (CALL_SITE_KEYWORD_EXCLUSIONS.has(symbol) || seen.has(symbol)) continue;
                seen.add(symbol);

                const definingFiles = exportedSymbolToFiles.get(symbol);
                if (!definingFiles) continue;

                for (const defFile of definingFiles) {
                    if (defFile !== relativePath && importedFiles.has(defFile)) {
                        graph.addEdge(relativePath, defFile, 'invokes');
                    }
                }
            }
        }
    }

    /**
     * Same idea as addInvokesEdges(), but for embedded snippets (n8n Code nodes, CI
     * `run:` blocks). These have no import statements to anchor precision on, so
     * instead of a 1-hop-neighbor restriction, edges are scoped to the same "family"
     * — snippets embedded in the same parent config file — and tagged low-confidence
     * since a name match alone is weaker evidence than a literal import.
     */
    private addSnippetInvokesEdges(graph: RepositoryGraph) {
        if (this.snippetContentCache.size === 0) return;

        const familyMembers = new Map<string, string[]>();
        for (const node of graph.getAllNodes()) {
            const embeddedIn = node.metadata?.embeddedIn;
            if (embeddedIn && this.snippetContentCache.has(node.id)) {
                if (!familyMembers.has(embeddedIn)) familyMembers.set(embeddedIn, []);
                familyMembers.get(embeddedIn)!.push(node.id);
            }
        }

        const callSiteRegex = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;

        for (const members of familyMembers.values()) {
            if (members.length < 2) continue;

            const exportedSymbolToMembers = new Map<string, string[]>();
            for (const id of members) {
                const exports: string[] = graph.getNode(id)?.metadata?.exports || [];
                for (const sym of exports) {
                    if (!exportedSymbolToMembers.has(sym)) exportedSymbolToMembers.set(sym, []);
                    exportedSymbolToMembers.get(sym)!.push(id);
                }
            }
            if (exportedSymbolToMembers.size === 0) continue;

            for (const callerId of members) {
                const content = this.snippetContentCache.get(callerId)!;
                const seen = new Set<string>();
                let match;
                while ((match = callSiteRegex.exec(content)) !== null) {
                    const symbol = match[1];
                    if (CALL_SITE_KEYWORD_EXCLUSIONS.has(symbol) || seen.has(symbol)) continue;
                    seen.add(symbol);

                    const definers = exportedSymbolToMembers.get(symbol);
                    if (!definers) continue;

                    for (const defId of definers) {
                        if (defId !== callerId) {
                            graph.addEdge(callerId, defId, 'invokes', { confidence: 'low' });
                        }
                    }
                }
            }
        }
    }

    private async collectWorkspaceFiles(dir: string) {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (['node_modules', '.git', 'dist', 'build', 'venv', '__pycache__'].includes(entry.name)) {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await this.collectWorkspaceFiles(fullPath);
            } else if (entry.isFile()) {
                const relativePath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
                this.workspaceFiles.add(relativePath);
            }
        }
    }

    generateWikiLinksMarkdown(graph: RepositoryGraph): string {
        let md = '# Repository Concept & Dependency Graph Wiki\n\n';
        
        const nodes = graph.getAllNodes();
        const codeNodes = nodes.filter(n => n.type === 'code');
        const docNodes = nodes.filter(n => n.type === 'doc');
        const conceptNodes = nodes.filter(n => n.type === 'concept');
        const pdfNodes = nodes.filter(n => n.type === 'pdf');

        if (codeNodes.length > 0) {
            md += '## Code Files\n';
            for (const node of codeNodes) {
                md += `### [[${node.id}]]\n`;
                if (node.metadata?.language) md += `- **Language**: ${node.metadata.language}\n`;
                if (node.metadata?.size) md += `- **Size**: ${node.metadata.size} bytes\n`;
                
                const edges = graph.getEdgesFrom(node.id);
                const imports = edges.filter(e => e.type === 'imports');
                const links = edges.filter(e => e.type === 'links');
                const invokes = edges.filter(e => e.type === 'invokes');

                if (imports.length > 0) {
                    md += `- **Dependencies**:\n`;
                    for (const imp of imports) {
                        md += `  - [[${imp.target}]]\n`;
                    }
                }
                if (invokes.length > 0) {
                    md += `- **Invocation Commands**:\n`;
                    for (const inv of invokes) {
                        md += `  - \`${inv.target}\`\n`;
                    }
                }
                if (links.length > 0) {
                    md += `- **Linked Resources**:\n`;
                    for (const l of links) {
                        md += `  - [[${l.target}]]\n`;
                    }
                }
                md += '\n';
            }
        }

        if (docNodes.length > 0 || conceptNodes.length > 0 || pdfNodes.length > 0) {
            md += '## Documentation & Concepts\n';
            const allDocs = [...docNodes, ...conceptNodes, ...pdfNodes];
            for (const node of allDocs) {
                md += `### [[${node.id}]]\n`;
                md += `- **Type**: ${node.type}\n`;
                
                const edges = graph.getEdgesFrom(node.id);
                if (edges.length > 0) {
                    md += `- **Links**:\n`;
                    for (const edge of edges) {
                        md += `  - [[${edge.target}]]\n`;
                    }
                }
                md += '\n';
            }
        }

        return md;
    }

    static generateSemanticProfile(content: string, ext: string): { docstring: string, exports: string[], imports: string[] } {
        const profile = {
            docstring: '',
            exports: [] as string[],
            imports: [] as string[]
        };

        // Extract docstring (first block comment / JSDoc / line docstring)
        if (ext === '.py') {
            const pyDocMatch = content.match(/^\s*"""([\s\S]*?)"""/m) || content.match(/^\s*'''([\s\S]*?)'''/m);
            if (pyDocMatch) {
                profile.docstring = pyDocMatch[1].trim();
            }
        } else if (['.rs', '.dart', '.go', '.c', '.cpp', '.h', '.hpp', '.kt'].includes(ext)) {
            // Match consecutive lines starting with /// or //! or //
            const rustDocMatch = content.match(/^(\s*\/\/\/.*(?:\r?\n\s*\/\/\/.*)*)/m) || 
                                 content.match(/^(\s*\/\/!.*(?:\r?\n\s*\/\/!.*)*)/m) ||
                                 content.match(/^(\s*\/\/.*(?:\r?\n\s*\/\/.*)*)/m);
            if (rustDocMatch) {
                profile.docstring = rustDocMatch[1].replace(/^\s*\/\/\/?!?\s?/gm, '').trim();
            } else {
                const jsDocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
                if (jsDocMatch) {
                    profile.docstring = jsDocMatch[1].replace(/^\s*\* ?/gm, '').trim();
                }
            }
        } else {
            const jsDocMatch = content.match(/\/\*\*([\s\S]*?)\*\//);
            if (jsDocMatch) {
                profile.docstring = jsDocMatch[1].replace(/^\s*\* ?/gm, '').trim();
            }
        }

        // Extract imports & exports
        if (['.ts', '.tsx', '.js', '.jsx', '.sol', '.dart'].includes(ext)) {
            const patterns = [
                /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
                /import\s+['"]([^'"]+)['"]/g,
                /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
            ];
            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    profile.imports.push(match[1]);
                }
            }

            let exportPattern = /export\s+(class|function|interface|const|let|var|type)\s+([a-zA-Z0-9_]+)/g;
            if (ext === '.sol') {
                exportPattern = /^\s*(contract|library|interface|struct)\s+([a-zA-Z0-9_]+)/gm;
            } else if (ext === '.dart') {
                exportPattern = /^\s*(class|enum|mixin|extension)\s+([a-zA-Z0-9_]+)/gm;
            }
            
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        } else if (ext === '.py') {
            const importPattern = /^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm;
            const fromPattern = /^\s*from\s+(\.?\.?[a-zA-Z0-9_.]+)\s+import/gm;
            let match;
            while ((match = importPattern.exec(content)) !== null) {
                match[1].split(',').forEach(m => profile.imports.push(m.trim().split(/\s+/)[0]));
            }
            while ((match = fromPattern.exec(content)) !== null) {
                profile.imports.push(match[1]);
            }

            const exportPattern = /^\s*(def|class)\s+([a-zA-Z0-9_]+)/gm;
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        } else if (ext === '.rs') {
            const importPattern = /^\s*use\s+([a-zA-Z0-9_:]+)/gm;
            let match;
            while ((match = importPattern.exec(content)) !== null) {
                profile.imports.push(match[1]);
            }

            const exportPattern = /^\s*pub\s+(fn|struct|enum|trait|mod|const)\s+([a-zA-Z0-9_]+)/gm;
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        } else if (ext === '.java') {
            const importPattern = /^\s*import\s+([a-zA-Z0-9_.]+)/gm;
            let match;
            while ((match = importPattern.exec(content)) !== null) {
                profile.imports.push(match[1]);
            }

            const exportPattern = /^\s*public\s+(class|interface|enum)\s+([a-zA-Z0-9_]+)/gm;
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        } else if (ext === '.go') {
            // Imports: single line 'import "fmt"' or block 'import (\n  "fmt"\n)'
            const singleImport = /import\s+['"]([^'"]+)['"]/g;
            const blockImport = /import\s*\(([\s\S]*?)\)/g;
            let match;
            while ((match = singleImport.exec(content)) !== null) {
                profile.imports.push(match[1]);
            }
            while ((match = blockImport.exec(content)) !== null) {
                const inner = match[1];
                const lines = inner.split('\n');
                for (const line of lines) {
                    const cleanLine = line.trim().replace(/['"]/g, '');
                    if (cleanLine && !cleanLine.startsWith('//') && !cleanLine.startsWith('/*')) {
                        profile.imports.push(cleanLine.split(/\s+/)[0]);
                    }
                }
            }

            // Exports: functions, types, consts, vars starting with capital letters
            const exportPattern = /^\s*(func|type|const|var)\s+([A-Z][a-zA-Z0-9_]*)/gm;
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        } else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) {
            // C/C++ imports: #include <vector> or #include "helper.h"
            const importPattern = /^\s*#include\s+['"<]([^'">]+)['">]/gm;
            let match;
            while ((match = importPattern.exec(content)) !== null) {
                profile.imports.push(match[1]);
            }

            // C/C++ exports: class, struct, enum definitions
            const exportPattern = /^\s*(class|struct|enum)\s+([a-zA-Z0-9_]+)/gm;
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        } else if (ext === '.kt') {
            // Kotlin imports: import kotlinx.coroutines.flow
            const importPattern = /^\s*import\s+([a-zA-Z0-9_.]+)/gm;
            let match;
            while ((match = importPattern.exec(content)) !== null) {
                profile.imports.push(match[1]);
            }

            // Kotlin exports: class, interface, object, fun
            const exportPattern = /^\s*(class|interface|object|fun)\s+([a-zA-Z0-9_]+)/gm;
            let exportMatch;
            while ((exportMatch = exportPattern.exec(content)) !== null) {
                profile.exports.push(exportMatch[2]);
            }
        }

        profile.imports = Array.from(new Set(profile.imports));
        profile.exports = Array.from(new Set(profile.exports));

        return profile;
    }
}

export interface ScoredNode {
    node: Node;
    score: number;
    reason: string;
}

export function semanticScore(
    query: string,
    graph: RepositoryGraph,
    includeDocs: boolean = false,
    topK: number = 5
): ScoredNode[] {
    const STOPWORDS = new Set(['how','does','the','and','are','was','for','not','can','its','use','via','per']);
    const tokens = query.toLowerCase()
        .split(/[\W_]+/)
        .filter(t => t.length > 2 && !STOPWORDS.has(t));

    if (tokens.length === 0) return [];

    const results: ScoredNode[] = [];
    for (const node of graph.getAllNodes()) {
        if (node.type !== 'code' && (!includeDocs || (node.type !== 'doc' && node.type !== 'concept' && node.type !== 'pdf'))) {
            continue;
        }

        const parts = node.id.toLowerCase()
            .split(/[\/\.\-_]/)
            .flatMap(p => p.split(/(?=[A-Z])/))
            .map(p => p.toLowerCase())
            .filter(p => p.length > 2);

        const hits = tokens.filter(t => parts.some(p => p.includes(t)));
        if (hits.length === 0) continue;

        const edgeCount = graph.getEdgesFrom(node.id).length;

        const score = (hits.length * 3) + Math.min(edgeCount, 5);
        results.push({
            node,
            score,
            reason: `keyword:[${hits.join(',')}] hub:${edgeCount}`
        });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

