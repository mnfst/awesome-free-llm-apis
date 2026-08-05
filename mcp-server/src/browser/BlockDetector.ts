/**
 * Detects the common "you didn't actually scrape the page, you scraped a
 * challenge wall" failure mode — a Cloudflare/CAPTCHA interstitial that never
 * got interacted with. Without this, a blocked page silently produces a
 * near-empty snapshot and looks identical to a genuinely empty page, which is
 * exactly the false-success case strict mode is meant to rule out.
 *
 * Deliberately text/marker based (not a live DOM check) so it works against
 * anything that already produced a snapshot string — take_snapshot output,
 * evaluate_script results, etc.
 */
export type BlockingChallengeType = 'cloudflare' | 'captcha' | 'unknown';

export interface BlockingChallengeResult {
    blocked: boolean;
    type?: BlockingChallengeType;
    evidence?: string;
}

const CLOUDFLARE_MARKERS = [
    'checking your browser before accessing',
    'attention required! | cloudflare',
    'just a moment...',
    'cf-turnstile',
    'cf_chl_',
    'ray id:',
    'verify you are human',
];

const CAPTCHA_MARKERS = [
    'g-recaptcha',
    'recaptcha',
    'hcaptcha',
    'h-captcha',
    "i'm not a robot",
    'please complete the security check',
    'captcha',
];

/**
 * Scans page text/HTML-ish content for known challenge markers. Case-insensitive.
 * `type` prefers 'cloudflare' over generic 'captcha' when both hit, since Cloudflare's
 * own Turnstile challenge often also contains the word "captcha" in surrounding copy.
 *
 * `structuralSignal`, when passed true, means SnapshotDiffer.looksLikeStructuralInterstitial()
 * already found a near-total top-level wipeout replaced by a small added set (an interstitial
 * swap shape) — OR'd into the marker-based result as a secondary, marker-independent signal for
 * challenge walls that don't happen to contain any of the known text markers above.
 */
export function detectBlockingChallenge(text: string, structuralSignal = false): BlockingChallengeResult {
    if (!text) return structuralSignal ? { blocked: true, type: 'unknown', evidence: 'structural-interstitial' } : { blocked: false };
    const lower = text.toLowerCase();

    for (const marker of CLOUDFLARE_MARKERS) {
        if (lower.includes(marker)) {
            return { blocked: true, type: 'cloudflare', evidence: marker };
        }
    }
    for (const marker of CAPTCHA_MARKERS) {
        if (lower.includes(marker)) {
            return { blocked: true, type: 'captcha', evidence: marker };
        }
    }
    if (structuralSignal) {
        return { blocked: true, type: 'unknown', evidence: 'structural-interstitial' };
    }
    return { blocked: false };
}
