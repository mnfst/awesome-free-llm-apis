/**
 * Dynamic DOM & Data Extractor for Scrapers.
 * Handles dynamic CSS class obfuscation (e.g. SofaScore, Next.js, Tailwind-hashed classes)
 * by prioritizing semantic attributes (data-testid, aria-labels, role attributes, structural hierarchy)
 * rather than relying solely on brittle generated class names.
 */
export class DynamicDomExtractor {
    /**
     * Generates a browser-side extraction script string that runs inside `evaluate_script`.
     * Strips obfuscated CSS hash names and maps elements based on text density, ARIA roles, and data attributes.
     */
    static buildSofaScoreExtractionScript(sport: 'football' | 'cricket' | 'auto'): string {
        return `
        () => {
            const results = [];
            
            // Helper to get clean text from an element
            const getText = (el) => el ? (el.innerText || el.textContent || '').trim() : '';

            // Search strategies based on semantic structure rather than dynamic hashes
            const matchContainers = document.querySelectorAll('[data-id], [aria-label*="vs"], [role="button"], a[href*="/match/"], a[href*="/event/"]');
            const processed = new Set();

            matchContainers.forEach(container => {
                const text = getText(container);
                if (!text || text.length < 5 || processed.has(text)) return;

                // Look for scores / numbers or team names within container
                const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 2) {
                    processed.add(text);
                    results.push({
                        rawText: text.slice(0, 150),
                        lines: lines.slice(0, 6),
                        href: container.href || container.querySelector('a')?.href || ''
                    });
                }
            });

            return JSON.stringify({
                totalFound: results.length,
                sport: "${sport}",
                items: results.slice(0, 50)
            });
        }
        `;
    }
}
