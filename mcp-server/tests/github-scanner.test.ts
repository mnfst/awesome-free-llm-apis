import { describe, it, expect } from 'vitest';
import { GithubRepoScanner } from '../src/utils/GithubRepoScanner.js';

describe('GithubRepoScanner', () => {
  describe('parseUrl', () => {
    it('should parse owner and repo from Github URL', () => {
      const result = GithubRepoScanner.parseUrl('https://github.com/nmap/nmap');
      expect(result).toEqual({ owner: 'nmap', repo: 'nmap', branch: undefined, path: undefined });
    });

    it('should handle trailing slash', () => {
      const result = GithubRepoScanner.parseUrl('https://github.com/nmap/nmap/');
      expect(result).toEqual({ owner: 'nmap', repo: 'nmap', branch: undefined, path: undefined });
    });

    it('should parse custom branch tree URLs', () => {
      const result = GithubRepoScanner.parseUrl('https://github.com/nmap/nmap/tree/stable');
      expect(result).toEqual({ owner: 'nmap', repo: 'nmap', branch: 'stable', path: undefined });
    });

    it('should parse custom branch blob URLs with files', () => {
      const result = GithubRepoScanner.parseUrl('https://github.com/nmap/nmap/blob/stable/README.md');
      expect(result).toEqual({ owner: 'nmap', repo: 'nmap', branch: 'stable', path: 'README.md' });
    });
  });

  describe('fetchRawContent', () => {
    it('should retrieve README.md contents', async () => {
      const content = await GithubRepoScanner.fetchRawContent('nmap', 'nmap', 'README.md');
      expect(content).toBeDefined();
      expect(content).toContain('Nmap');
    });

    it('should retrieve README.md contents from a custom branch', async () => {
      const content = await GithubRepoScanner.fetchRawContent('nmap', 'nmap', 'README.md', 'master');
      expect(content).toBeDefined();
      expect(content).toContain('Nmap');
    });
  });

  describe('analyzeCode', () => {
    it('should extract dependencies, functions, and flow correctly', () => {
      const sampleCode = `
        import { helper } from './helper';
        import * as path from 'path';
        const fs = require('fs');

        function processData(data) {
          validate(data);
          save(data);
        }

        function validate(data) {
          return true;
        }

        const save = (data) => {
          console.log("Saving");
        };
      `;

      const result = GithubRepoScanner.analyzeCode(sampleCode);

      expect(result.dependencies).toContain('./helper');
      expect(result.dependencies).toContain('path');
      expect(result.dependencies).toContain('fs');

      expect(result.functions).toContain('processData');
      expect(result.functions).toContain('validate');
      expect(result.functions).toContain('save');

      expect(result.flow).toContain('processData -> validate');
      expect(result.flow).toContain('processData -> save');
    });
  });
});
