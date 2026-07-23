import fetch from 'node-fetch';

/** Fixed namespace shared across all workspaces for the cyber-tools wiki (see CHANGELOG "global wiki" item). */
export const GLOBAL_CYBER_WIKI_NS = 'global-cyber-tools';

/** Known security-tool binaries used to gate cyber-tool discovery/reinforcement. */
export const CYBER_TOOL_NAMES = ['nmap', 'sqlmap', 'hydra', 'gobuster', 'nikto', 'hashcat', 'john', 'metasploit', 'wireshark', 'burpsuite'];

export class GithubRepoScanner {
  /**
   * Parses a Github URL to extract the owner and repository name.
   */
  static parseUrl(url: string): { owner: string; repo: string; branch?: string; path?: string } {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(blob|tree|raw)\/([^/]+)(?:\/(.*))?)?/i);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/i, ''),
      branch: match[4],
      path: match[5]
    };
  }

  /**
   * Retrieves raw content of a file from a GitHub repository.
   */
    static async fetchRawContent(owner: string, repo: string, path: string, branch?: string): Promise<string> {
    const branches = branch ? [branch] : ['main', 'master'];
    for (const b of branches) {
      const url = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + b + '/' + path;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          return await response.text();
        }
      } catch (e) {
        clearTimeout(timeoutId);
      }
    }
    throw new Error('Failed to fetch raw content for ' + owner + '/' + repo + '/' + path);
  }

  /**
   * Performs dependency mapping and function flow tracing on code.
   */
  static analyzeCode(code: string): { dependencies: string[]; functions: string[]; flow: string[]; flags: string[] } {
    // 1. Dependency Mapping
    const dependencies: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const importSimpleRegex = /import\s+['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      if (!dependencies.includes(match[1])) dependencies.push(match[1]);
    }
    while ((match = importSimpleRegex.exec(code)) !== null) {
      if (!dependencies.includes(match[1])) dependencies.push(match[1]);
    }
    while ((match = requireRegex.exec(code)) !== null) {
      if (!dependencies.includes(match[1])) dependencies.push(match[1]);
    }

    // 2. Function Extraction
    const functions: string[] = [];
    const funcDeclRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const arrowFuncRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
    const methodRegex = /(?:public|private|protected|static|async)?\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g;
    const pyFuncRegex = /def\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const cppFuncRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g;
    const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'try', 'return', 'await', 'import', 'expect', 'describe', 'it', 'get', 'set', 'constructor', 'else', 'sizeof', 'sizeof_class']);

    const funcPositions: { name: string; index: number }[] = [];

    while ((match = funcDeclRegex.exec(code)) !== null) {
      const name = match[1];
      if (!keywords.has(name) && !functions.includes(name)) {
        functions.push(name);
        funcPositions.push({ name, index: match.index });
      }
    }
    while ((match = arrowFuncRegex.exec(code)) !== null) {
      const name = match[1];
      if (!keywords.has(name) && !functions.includes(name)) {
        functions.push(name);
        funcPositions.push({ name, index: match.index });
      }
    }
    while ((match = methodRegex.exec(code)) !== null) {
      const name = match[1];
      if (!keywords.has(name) && !functions.includes(name)) {
        functions.push(name);
        funcPositions.push({ name, index: match.index });
      }
    }
    while ((match = pyFuncRegex.exec(code)) !== null) {
      const name = match[1];
      if (!keywords.has(name) && !functions.includes(name)) {
        functions.push(name);
        funcPositions.push({ name, index: match.index });
      }
    }
    while ((match = cppFuncRegex.exec(code)) !== null) {
      const name = match[1];
      if (!keywords.has(name) && !functions.includes(name)) {
        functions.push(name);
        funcPositions.push({ name, index: match.index });
      }
    }

    // Sort function positions to trace bodies
    funcPositions.sort((a, b) => a.index - b.index);

    // 3. Flow Tracing
    const flow: string[] = [];
    for (let i = 0; i < funcPositions.length; i++) {
      const caller = funcPositions[i];
      const start = caller.index;
      const end = i + 1 < funcPositions.length ? funcPositions[i + 1].index : code.length;
      const body = code.substring(start, end);

      for (const callee of functions) {
        if (callee === caller.name) continue;
        const callPattern = new RegExp(`\\b${callee}\\s*\\(`, 'g');
        if (callPattern.test(body)) {
          flow.push(`${caller.name} -> ${callee}`);
        }
      }
    }

    // 4. Option/Flag Extraction
    const flags: string[] = [];
    const cOptionRegex = /\{\s*["']([a-zA-Z0-9_-]+)["']\s*,\s*(?:no_argument|required_argument|optional_argument|0|1|2)\s*,\s*[^,]+\s*,\s*['"]?([a-zA-Z0-9_-])['"]?\s*\}/gi;
    const pyOptionRegex = /add_argument\s*\(\s*['"](-[a-zA-Z0-9_-])['"]\s*,\s*['"](--[a-zA-Z0-9_-]+)['"]/gi;
    const pySingleOptionRegex = /add_argument\s*\(\s*['"](--?[a-zA-Z0-9_-]+)['"]/gi;

    while ((match = cOptionRegex.exec(code)) !== null) {
      const longName = match[1];
      const shortChar = match[2];
      const flagStr = `--${longName} (-${shortChar})`;
      if (!flags.includes(flagStr)) flags.push(flagStr);
    }
    while ((match = pyOptionRegex.exec(code)) !== null) {
      const flagStr = `${match[1]}/${match[2]}`;
      if (!flags.includes(flagStr)) flags.push(flagStr);
    }
    while ((match = pySingleOptionRegex.exec(code)) !== null) {
      const flagStr = match[1];
      if (!flags.includes(flagStr)) flags.push(flagStr);
    }

    return {
      dependencies,
      functions,
      flow,
      flags
    };
  }

  /**
   * Retrieves the repository tree using the Github API.
   */
  static async fetchRepoTree(owner: string, repo: string, branch?: string): Promise<{ path: string; type: string }[]> {
    const branches = branch ? [branch] : ['main', 'master'];
    for (const br of branches) {
      const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${br}?recursive=true`;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        });
        if (response.ok) {
          const data = await response.json() as { tree: { path: string; type: string }[] };
          if (data && Array.isArray(data.tree)) {
            return data.tree;
          }
        }
      } catch (e) {
        // Continue
      }
    }
    return [];
  }

  /**
   * Scans a remote GitHub repository tree, downloads key source files, and parses their codebase structure.
   */
  static async scanRepoCode(
    owner: string, 
    repo: string, 
    branch?: string, 
    commands?: string[],
    promptText?: string
  ): Promise<{ 
    treeSummary: string[]; 
    scannedFiles: { path: string; dependencies: string[]; functions: string[]; flow: string[]; flags: string[] }[] 
  }> {
    const tree = await this.fetchRepoTree(owner, repo, branch);
    const treeSummary = tree.filter(t => t.type === 'blob').map(t => t.path);
    
    let matchedFiles: string[] = [];
    
    // Check if any file in the tree is mentioned fully/partially in the prompt
    if (promptText) {
      const promptLower = promptText.toLowerCase();
      const mentioned = tree.filter(entry => {
        if (entry.type !== 'blob') return false;
        const pathLower = entry.path.toLowerCase();
        const basename = entry.path.substring(entry.path.lastIndexOf('/') + 1).toLowerCase();
        return promptLower.includes(pathLower) || (basename.length > 5 && promptLower.includes(basename));
      });
      if (mentioned.length > 0) {
        matchedFiles = mentioned.slice(0, 3).map(m => m.path);
      }
    }
    
    // Fallback to heuristic scoring if no file is explicitly mentioned
    if (matchedFiles.length === 0) {
      const candidates: { path: string; score: number }[] = [];
      const sourceExtensions = ['.ts', '.py', '.js', '.go', '.rs', '.c', '.cpp', '.cc', '.h', '.hpp', '.lua', '.sh', '.rb', '.php', '.cs'];
      
      for (const entry of tree) {
        if (entry.type !== 'blob') continue;
        const extIndex = entry.path.lastIndexOf('.');
        if (extIndex === -1) continue;
        const ext = entry.path.slice(extIndex);
        if (!sourceExtensions.includes(ext.toLowerCase())) continue;
        
        const pathLower = entry.path.toLowerCase();
        const basename = entry.path.substring(entry.path.lastIndexOf('/') + 1).toLowerCase();
        let score = 0;
        
        if (commands) {
          for (const cmd of commands) {
            const cmdLower = cmd.toLowerCase();
            if (basename === `${cmdLower}${ext}`) {
              score += 100;
            } else if (basename.includes(cmdLower)) {
              score += 40;
            } else if (pathLower.includes(cmdLower)) {
              score += 20;
            }
          }
        }
        
        if (basename.includes('main') || basename.includes('cli') || basename.includes('option') || basename.includes('args')) {
          score += 50;
        }
        
        if (pathLower.includes('src/') || pathLower.includes('tools/') || pathLower.includes('utils/')) {
          score += 10;
        }
        
        if (ext === '.h' || ext === '.hpp') {
          score -= 5;
        }
        
        candidates.push({ path: entry.path, score });
      }
      
      candidates.sort((a, b) => b.score - a.score);
      matchedFiles = candidates.slice(0, 3).map(c => c.path);
    }
    
    const scannedFiles: { path: string; dependencies: string[]; functions: string[]; flow: string[]; flags: string[] }[] = [];
    for (const filePath of matchedFiles) {
      try {
        const fileContent = await this.fetchRawContent(owner, repo, filePath, branch);
        const analysis = this.analyzeCode(fileContent);
        scannedFiles.push({
          path: filePath,
          ...analysis
        });
      } catch (err) {
        // Continue
      }
    }
    
    return {
      treeSummary: treeSummary.slice(0, 50),
      scannedFiles
    };
  }
}
