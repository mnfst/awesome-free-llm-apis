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
        priorityFiles?: string[],
        manifestDependencies?: string[],
        vulnerableDeps?: string[]
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

        await this.walk(rootPath, rootPath, keywords, candidates, ig, 0, overrideIgnores, gitignoreRoot, isTheoretical, state, priorityFiles, manifestDependencies, vulnerableDeps);

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
        priorityFiles?: string[],
        manifestDependencies?: string[],
        vulnerableDeps?: string[]
    ): Promise<void> {
        if (depth > MAX_DEPTH || state.filesScanned >= MAX_FILES_SCANNED) return;

        try {
            const entries = await fs.readdir(currentDir, { withFileTypes: true });

            // Prioritize walking vulnerable dependencies and primary source directories first
            const sortedEntries = [...entries].sort((a, b) => {
                if (vulnerableDeps && vulnerableDeps.length > 0) {
                    const aIsVuln = a.isDirectory() && vulnerableDeps.some(v => a.name.toLowerCase().includes(v));
                    const bIsVuln = b.isDirectory() && vulnerableDeps.some(v => b.name.toLowerCase().includes(v));
                    if (aIsVuln && !bIsVuln) return -1;
                    if (!aIsVuln && bIsVuln) return 1;
                }
                const aIsSrc = a.isDirectory() && ['src', 'lib', 'app'].includes(a.name.toLowerCase());
                const bIsSrc = b.isDirectory() && ['src', 'lib', 'app'].includes(b.name.toLowerCase());
                if (aIsSrc && !bIsSrc) return -1;
                if (!aIsSrc && bIsSrc) return 1;

                if (!overrideIgnores) {
                    const aIsIgnoredDir = a.isDirectory() && EXCLUDE_DIRS.includes(a.name);
                    const bIsIgnoredDir = b.isDirectory() && EXCLUDE_DIRS.includes(b.name);
                    if (aIsIgnoredDir && !bIsIgnoredDir) return 1;
                    if (!aIsIgnoredDir && bIsIgnoredDir) return -1;
                }
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
                    // NodeModules Filtering: If we are scanning node_modules, only walk subfolders that are declared manifest dependencies
                    if (overrideIgnores && fullPath.includes('node_modules') && manifestDependencies && manifestDependencies.length > 0) {
                        const subPath = fullPath.replace(/\\/g, '/').split('/node_modules/').pop() || '';
                        const segments = subPath.split('/');
                        if (segments.length > 0 && segments[0] !== '') {
                            const hasMatch = segments.some(seg => {
                                const clean = seg.replace(/^@/, '').toLowerCase();
                                return manifestDependencies.includes(clean);
                            });
                            if (!hasMatch) {
                                continue;
                            }
                        }
                    }
                    await this.walk(root, fullPath, keywords, candidates, ig, depth + 1, overrideIgnores, gitignoreRoot, isTheoretical, state, priorityFiles, manifestDependencies, vulnerableDeps);
                } else if (entry.isFile()) {
                    // Skip type declaration files when scanning node_modules to avoid scanning thousands of .d.ts files
                    if (overrideIgnores && fullPath.includes('node_modules') && (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.mts') || entry.name.endsWith('.d.cts'))) {
                        continue;
                    }

                    state.filesScanned++;
                    const ext = path.extname(entry.name).toLowerCase();
                    
                    // Simple extension filter (still useful to prune binaries quickly)
                    const isPinnedExt = keywords.some(kw => entry.name.toLowerCase() === kw.toLowerCase());
                    if (!isPinnedExt && EXCLUDE_EXTENSIONS.includes(ext)) continue;

                    const relativePath = path.relative(root, fullPath);
                    let score = this.calculateScore(entry.name, relativePath, ext, keywords, isTheoretical);
                    
                    const isManifestDep = overrideIgnores && relativePath.includes('node_modules') && manifestDependencies && manifestDependencies.length > 0 && (() => {
                        const subPath = relativePath.replace(/\\/g, '/').split('/node_modules/').pop() || '';
                        const segments = subPath.split('/');
                        return segments.some(seg => {
                            const clean = seg.replace(/^@/, '').toLowerCase();
                            return manifestDependencies.includes(clean);
                        });
                    })();
                    
                    const isVulnerableDep = overrideIgnores && relativePath.includes('node_modules') && vulnerableDeps && vulnerableDeps.length > 0 && (() => {
                        const subPath = relativePath.replace(/\\/g, '/').split('/node_modules/').pop() || '';
                        const segments = subPath.split('/');
                        return segments.some(seg => {
                            const clean = seg.replace(/^@/, '').toLowerCase();
                            return vulnerableDeps.includes(clean);
                        });
                    })();

                    if (isVulnerableDep) {
                        score += 150;
                    } else if (isManifestDep) {
                        score += 30;
                    }
                    
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
