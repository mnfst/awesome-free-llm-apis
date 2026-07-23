/**
 * ComprehensivePageObserver & ElementalBehaviorEngine
 * 
 * Provides 100% page depth scrolling, interactive button classification,
 * stored data tracking (localStorage/sessionStorage/cookies), and background
 * network request delta observation.
 */

export interface ButtonBehaviorEntry {
    index: number;
    text: string;
    role?: string;
    category: 'TAB_FILTER' | 'ACCORDION_TOGGLE' | 'DATE_PICKER' | 'ACTION_BUTTON' | 'NAVIGATION_LINK';
    selector: string;
}

export interface StoredDataSnapshot {
    localStorageKeys: string[];
    sessionStorageKeys: string[];
    cookieCount: number;
    cookieNames: string[];
}

export class ComprehensivePageObserver {
    /**
     * DevTools JS script to classify all interactive buttons & observe stored state.
     */
    static getFullPageBehaviorScript(): string {
        return `() => {
            const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
            const windowHeight = window.innerHeight || 0;
            const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1);
            const depthPercentage = Math.round(((scrollTop + windowHeight) / scrollHeight) * 100);

            // 1. Inspect Stored State
            const localStorageKeys = Object.keys(window.localStorage || {});
            const sessionStorageKeys = Object.keys(window.sessionStorage || {});
            const cookieNames = (document.cookie || '').split(';').map(c => c.split('=')[0].trim()).filter(Boolean);

            // 2. Classify Interactive Buttons & Elements
            const interactiveNodes = Array.from(document.querySelectorAll('button, a[href], div[role="button"], div[role="tab"], div[class*="Filter"], div[class*="tab"]'));
            
            const classifiedButtons = interactiveNodes.slice(0, 30).map((el, idx) => {
                const text = (el.innerText || el.textContent || '').trim().replace(/\\n/g, ' ').slice(0, 40);
                const role = el.getAttribute('role') || el.tagName.toLowerCase();
                const className = (el.className || '').toString();
                
                let category = 'NAVIGATION_LINK';
                if (role === 'tab' || className.includes('tab') || className.includes('Filter')) {
                    category = 'TAB_FILTER';
                } else if (text.includes('Today') || text.includes('Live') || text.includes('2026') || /\\d{1,2}\\s+[A-Za-z]+/.test(text)) {
                    category = 'DATE_PICKER';
                } else if (className.includes('accordion') || className.includes('toggle') || className.includes('expand')) {
                    category = 'ACCORDION_TOGGLE';
                } else if (role === 'button' || el.tagName.toLowerCase() === 'button') {
                    category = 'ACTION_BUTTON';
                }

                return {
                    index: idx + 1,
                    text,
                    role,
                    category,
                    tagName: el.tagName.toLowerCase()
                };
            });

            return JSON.stringify({
                scrollTop,
                windowHeight,
                scrollHeight,
                depthPercentage,
                isBottom: depthPercentage >= 95,
                storedData: {
                    localStorageKeys,
                    sessionStorageKeys,
                    cookieCount: cookieNames.length,
                    cookieNames: cookieNames.slice(0, 10)
                },
                classifiedButtonsCount: classifiedButtons.length,
                classifiedButtons
            });
        }`;
    }
}
