/**
 * BLOCK MINER - IRON DOME SECURITY (V5)
 * Simplified & Stabilized version.
 * Focuses on high-value actions without breaking site navigation.
 */

class IronDome {
    flags: Set<string>;
    secretKey: string;
    startTime: number;
    isBotDetected: boolean;

    constructor() {
        this.flags = new Set();
        this.secretKey = Math.random().toString(36).substring(7);
        this.startTime = Date.now();
        this.isBotDetected = false;

        if (typeof window !== 'undefined') {
            this.init();
        }
    }

    init(): void {
        // 1. Basic automation check
        if (navigator.webdriver) this.isBotDetected = true;

        // 2. Honeytrap (Passive) removed - it was causing false positives
    }

    generatePayload(): { fingerprint: string; isBot: boolean; sk: string } {
        const now = Date.now();
        const screenInfo =
            typeof window !== 'undefined' && typeof window.screen !== 'undefined'
                ? {
                    width: Number(window.screen.width || 0),
                    height: Number(window.screen.height || 0),
                    dpr: Number(window.devicePixelRatio || 1),
                    colorDepth: Number(window.screen.colorDepth || 0),
                }
                : null;
        const data = {
            ts: now,
            b: this.isBotDetected,
            u: now - this.startTime,
            k: this.secretKey,
            v: "5.1",
            tz: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || null : null,
            l: typeof navigator !== 'undefined' ? navigator.language || null : null,
            p:
                typeof navigator !== 'undefined'
                    ? navigator.userAgentData?.platform || navigator.platform || null
                    : null,
            hc: typeof navigator !== 'undefined' ? Number(navigator.hardwareConcurrency || 0) : 0,
            dm: typeof navigator !== 'undefined' ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0) : 0,
            tp: typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0,
            s: screenInfo
        };

        const encoded = utf8ToBase64(JSON.stringify(data));

        return { fingerprint: encoded, isBot: this.isBotDetected, sk: this.secretKey };
    }
}

function utf8ToBase64(value: string): string {
    if (typeof window === 'undefined') {
        return Buffer.from(value, 'utf8').toString('base64');
    }
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
}

const dome = new IronDome();

export const isAutomationDetected = () => dome.isBotDetected;

export const generateSecurityPayload = () => dome.generatePayload();

export const validateTrustedEvent = (e: unknown): boolean => {
    if (typeof e !== 'object' || e === null) return false;
    const ev = e as { isTrusted?: boolean; nativeEvent?: { isTrusted?: boolean } };
    const trusted = ev.isTrusted ?? ev.nativeEvent?.isTrusted;
    if (trusted === false) return false;
    if (dome.isBotDetected) return false;
    return true;
};
