/**
 * BLOCK MINER - IRON DOME SECURITY (V5)
 * Simplified & Stabilized version.
 * Focuses on high-value actions without breaking site navigation.
 */

class IronDome {
    constructor() {
        this.flags = new Set();
        this.secretKey = Math.random().toString(36).substring(7);
        this.startTime = Date.now();
        this.isBotDetected = false;

        if (typeof window !== 'undefined') {
            this.init();
        }
    }

    init() {
        // 1. Basic automation check
        if (navigator.webdriver) this.isBotDetected = true;

        // 2. Honeytrap (Passive) removed - it was causing false positives
    }

    generatePayload() {
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
            dm: typeof navigator !== 'undefined' ? Number(navigator.deviceMemory || 0) : 0,
            tp: typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0,
            s: screenInfo
        };

        const encoded = btoa(JSON.stringify(data));

        return { fingerprint: encoded, isBot: this.isBotDetected, sk: this.secretKey };
    }
}

const dome = new IronDome();

export const isAutomationDetected = () => dome.isBotDetected;

export const generateSecurityPayload = () => dome.generatePayload();

export const validateTrustedEvent = (e) => {
    if (!e || e.isTrusted === false) return false;
    if (dome.isBotDetected) return false;
    return true;
};
