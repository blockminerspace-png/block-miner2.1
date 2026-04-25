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
        const data = {
            ts: now,
            b: this.isBotDetected,
            u: now - this.startTime,
            k: this.secretKey,
            v: "5.0"
        };

        const encoded = btoa(JSON.stringify(data));

        return { fingerprint: encoded, isBot: this.isBotDetected };
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
