/**
 * PageDepthObserver & ElementHierarchyTree
 * 
 * Provides deep awareness of page scroll depth, element tree hierarchy,
 * and background network request deltas fired during dynamic page navigation.
 */

export interface PageDepthState {
    scrollTop: number;
    windowHeight: number;
    scrollHeight: number;
    depthPercentage: number;
    visibleElementsCount: number;
    interactiveElementsCount: number;
}

export interface ElementHierarchyNode {
    tag: string;
    role?: string;
    className?: string;
    textPreview: string;
    childCount: number;
}

export class PageDepthObserver {
    /**
     * DevTools JS function string to measure exact page scroll depth and element metrics.
     */
    static getDepthEvaluationScript(): string {
        return `() => {
            const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
            const windowHeight = window.innerHeight || 0;
            const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 1;
            const depthPercentage = Math.round(((scrollTop + windowHeight) / scrollHeight) * 100);

            const allElements = Array.from(document.querySelectorAll('*'));
            const interactiveElements = Array.from(document.querySelectorAll('a, button, input, div[role="button"], div[role="tab"]'));

            const hierarchySample = Array.from(document.querySelectorAll('div[class*="event"], div[class*="match"], div[class*="card"], header, nav'))
                .slice(0, 15)
                .map(el => ({
                    tag: el.tagName.toLowerCase(),
                    role: el.getAttribute('role') || undefined,
                    className: (el.className || '').toString().slice(0, 40),
                    textPreview: (el.innerText || el.textContent || '').trim().slice(0, 50).replace(/\\n/g, ' '),
                    childCount: el.children.length
                }));

            return JSON.stringify({
                scrollTop,
                windowHeight,
                scrollHeight,
                depthPercentage,
                visibleElementsCount: allElements.length,
                interactiveElementsCount: interactiveElements.length,
                hierarchySample
            });
        }`;
    }
}
