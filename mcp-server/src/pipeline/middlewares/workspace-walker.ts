import fs from 'fs/promises';
import path from 'path';
import ignore from 'ignore';
import { 
    EXCLUDE_DIRS, 
    EXCLUDE_EXTENSIONS,
    MAX_DEPTH,
    MAX_FILES_SCANNED
} from './constants.js';

export interface FileCandidate {
    path: string;
    score: number;
}

export interface WalkState {
    filesScanned: number;
}

export class WorkspaceWalker {
    /**
     * Recursively find and rank files based on keyword relevance
     */
    static async findRelevantFiles(
        rootPath: string,
        keywords: string[],
        limit: number = 30,
        overrideIgnores: boolean = false,
        isTheoretical: boolean = false,
        priorityFiles?: string[]
    ): Promise<string[]> {
        const candidates: FileCandidate[] = [];
        const state: WalkState = { filesScanned: 0 };

        const ig = ignore().add(EXCLUDE_DIRS);
        let gitignoreRoot = rootPath;

        if (!overrideIgnores) {
            let currentPath = rootPath;
            for (let i = 0; i < 4; i++) {
                try {
                    const gitignorePath = path.join(currentPath, '.gitignore');
                    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
                    ig.add(gitignoreContent);
                    gitignoreRoot = currentPath;
                    break;
                } catch {
                    const nextPath = path.dirname(currentPath);
                    if (nextPath === currentPath) break;
                    currentPath = nextPath;
                }
            }
        }

        await this.walk(rootPath, rootPath, keywords, candidates, ig, 0, overrideIgnores, gitignoreRoot, isTheoretical, state, priorityFiles);

        // Sort by score (descending) and return top paths
        return candidates
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(c => c.path);
    }

    private static async walk(
        root: string,
        currentDir: string,
        keywords: string[],
        candidates: FileCandidate[],
        ig: any,
        depth: number,
        overrideIgnores: boolean,
        gitignoreRoot: string,
        isTheoretical: boolean,
        state: WalkState,
        priorityFiles?: string[]
    ): Promise<void> {
        if (depth > MAX_DEPTH || state.filesScanned >= MAX_FILES_SCANNED) return;

        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });

            // Prioritize walking non-ignored directories first to prevent scan budget starvation
            const sortedEntries = [...entries].sort((a, b) => {
                const aIsIgnoredDir = a.isDirectory() && EXCLUDE_DIRS.includes(a.name);
                const bIsIgnoredDir = b.isDirectory() && EXCLUDE_DIRS.includes(b.name);
                if (aIsIgnoredDir && !bIsIgnoredDir) return 1;
                if (!aIsIgnoredDir && bIsIgnoredDir) return -1;
                return 0;
            });

            for (const entry of sortedEntries) {
                if (state.filesScanned >= MAX_FILES_SCANNED) break;

                const fullPath = path.join(currentDir, entry.name);
                let relativePathToGitignore = path.relative(gitignoreRoot, fullPath).replace(/\\/g, '/');
                if (entry.isDirectory()) {
                    relativePathToGitignore += '/';
                }

                // Skip if ignored (unless overridden or the entry name exactly matches a keyword — 
                // explicit filename pinning always bypasses gitignore)
                const isPinned = keywords.some(kw => entry.name.toLowerCase() === kw.toLowerCase());
                if (!overrideIgnores && !isPinned && ig.ignores(relativePathToGitignore)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await this.walk(root, fullPath, keywords, candidates, ig, depth + 1, overrideIgnores, gitignoreRoot, isTheoretical, state, priorityFiles);
                } else if (entry.isFile()) {
                    state.filesScanned++;
                    const ext = path.extname(entry.name).toLowerCase();
                    
                    // Simple extension filter (still useful to prune binaries quickly)
                    const isPinnedExt = keywords.some(kw => entry.name.toLowerCase() === kw.toLowerCase());
                    if (!isPinnedExt && EXCLUDE_EXTENSIONS.includes(ext)) continue;

                    const relativePath = path.relative(root, fullPath);
                    let score = this.calculateScore(entry.name, relativePath, ext, keywords, isTheoretical);
                    
                    const isPriority = priorityFiles?.some(pf => {
                        const resolvedPf = path.isAbsolute(pf) ? pf : path.resolve(root, pf);
                        return resolvedPf === fullPath;
                    });
                    if (isPriority) {
                        score += 200;
                    }

                    if (score > 0) {
                        candidates.push({ path: fullPath, score });
                    }
                }
            }
        } catch (error) {
            // Silently ignore errors for inaccessible directories
        }
    }

    private static calculateScore(filename: string, relativePath: string, ext: string, keywords: string[], isTheoretical: boolean): number {
        let score = 0;
        const nameLower = filename.toLowerCase();
        const pathLower = relativePath.toLowerCase();

        // 1. Keyword matching check (mandatory when keywords are provided)
        let keywordMatched = false;
        if (keywords.length > 0) {
            for (const kw of keywords) {
                const kwLower = kw.toLowerCase();
                
                // Filename matches
                if (nameLower.includes(kwLower)) {
                    keywordMatched = true;
                    score += 15;
                    // Exact full-filename match (including extension): user explicitly named this file.
                    // Boost strongly so it always wins the candidate race regardless of extension penalty.
                    if (nameLower === kwLower) {
                        score += 100;
                    } else {
                        // Partial exact match (keyword matches name minus extension)
                        const nameWithoutExt = path.parse(nameLower).name;
                        const normalizedName = nameWithoutExt.replace(/[_-]/g, '').toLowerCase();
                        const normalizedKw = kwLower.replace(/[_-]/g, '').toLowerCase();
                        if (normalizedName === normalizedKw) score += 30;
                    }
                }
                
                // Path matches (excluding filename itself to avoid double counting)
                const dirPart = path.dirname(pathLower);
                if (dirPart.includes(kwLower)) {
                    keywordMatched = true;
                    
                    // Check if any directory segment exactly matches the keyword
                    const segments = dirPart.split(/[/\\]/);
                    const exactDirMatch = segments.some(seg => seg === kwLower);
                    if (exactDirMatch) {
                        score += 25; // High boost for exact folder match
                    } else {
                        score += 10; // Generic substring directory match
                    }
                }
            }

            // Reject files that have zero keyword matches
            if (!keywordMatched) {
                return 0;
            }
        }

        // 2. Extension boost (prioritize source code or docs based on mode)
        const codeExtensions = ['.ts', '.js', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h'];
        const docExtensions = ['.md', '.txt', '.pdf', '.json', '.yaml', '.yml'];
        
        if (isTheoretical) {
            if (docExtensions.includes(ext)) score += 20;
            if (codeExtensions.includes(ext)) score += 5;
        } else {
            if (codeExtensions.includes(ext)) score += 20;
            if (docExtensions.includes(ext)) score += 5;
        }

        // 3. Path-based boosts/penalties
        // Prioritize core source directories
        if (pathLower.includes('core') || pathLower.includes('src') || pathLower.includes('app') || pathLower.includes('lib')) {
            score += 20;
        }
        
        // Penalize noise directories
        if (pathLower.includes('backup') || pathLower.includes('archive') || pathLower.includes('temp') || pathLower.includes('tmp') || pathLower.includes('mock')) {
            score -= 50;
        }

        // 4. Progressive Nesting Depth Penalty
        const depth = relativePath.split(/[/\\]/).length - 1;
        score -= depth * 2;

        // 5. Structural boost
        if (nameLower.includes('config') || nameLower.includes('setup') || nameLower.includes('index')) {
            score += 3;
        }

        return score;
    }
}
