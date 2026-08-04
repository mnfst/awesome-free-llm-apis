import type { SubtaskHistoryEntry } from './SubtaskDecomposer.js';

export class HistoryManager {
    static appendHistoryEntry(
        history: SubtaskHistoryEntry[],
        entry: SubtaskHistoryEntry,
        maxEntries = 50
    ): void {
        history.push(entry);
        if (history.length > maxEntries) {
            history.splice(0, history.length - maxEntries);
        }
    }

    static formatHistoryForContext(history: SubtaskHistoryEntry[], limit = 5): string {
        if (!history || history.length === 0) return '';
        const recent = history.slice(-limit);
        return recent.map((item, idx) => {
            const files = item.filesModified.length > 0 ? ` (modified: ${item.filesModified.join(', ')})` : '';
            return `Subtask ${idx + 1}: ${item.task}${files}\nOutput: ${item.output.slice(0, 300)}...`;
        }).join('\n\n');
    }
}
