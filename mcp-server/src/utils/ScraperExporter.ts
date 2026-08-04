import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface ExportOptions {
    outputDir: string;
    filenameBase: string;
    sourceUrl?: string;
}

export class ScraperExporter {
    static sanitizeCsvCell(value: any): string {
        if (value === null || value === undefined) return '""';
        let str = String(value);

        // Anti-CSV Formula Injection: Prefix formula triggers with a single quote
        if (/^[=+\-@\t\r]/.test(str)) {
            str = `'${str}`;
        }

        // If string contains quotes, commas, or newlines, enclose in quotes and escape internal quotes
        if (/[",\n\r]/.test(str)) {
            str = `"${str.replace(/"/g, '""')}"`;
        } else {
            str = `"${str}"`;
        }

        return str;
    }

    static async exportToJSON(records: Record<string, any>[], options: ExportOptions): Promise<string> {
        await fs.mkdir(options.outputDir, { recursive: true });
        const filePath = path.join(options.outputDir, `${options.filenameBase}.json`);

        const payload = {
            metadata: {
                timestamp: new Date().toISOString(),
                sourceUrl: options.sourceUrl || '',
                recordCount: records.length
            },
            records
        };

        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
        return filePath;
    }

    static async exportToCSV(records: Record<string, any>[], options: ExportOptions): Promise<string> {
        await fs.mkdir(options.outputDir, { recursive: true });
        const filePath = path.join(options.outputDir, `${options.filenameBase}.csv`);

        if (records.length === 0) {
            await fs.writeFile(filePath, '\uFEFF', 'utf-8'); // UTF-8 BOM
            return filePath;
        }

        // Collect all unique keys across records
        const headers = Array.from(new Set(records.flatMap(r => Object.keys(r))));
        const headerRow = headers.map(h => this.sanitizeCsvCell(h)).join(',');

        const rows = records.map(record => {
            return headers.map(h => this.sanitizeCsvCell(record[h])).join(',');
        });

        // Add UTF-8 BOM (\uFEFF) for Excel cross-platform compatibility
        const csvContent = '\uFEFF' + [headerRow, ...rows].join('\n');
        await fs.writeFile(filePath, csvContent, 'utf-8');
        return filePath;
    }
}
