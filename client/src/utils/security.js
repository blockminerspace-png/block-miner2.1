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

        // 2. Simple Honeytrap (Passive)
        // We check if something is lying about event trust
        const trapType = 'heartbeat-' + this.secretKey;
        const handler = (e) => {
            if (e.isTrusted === true) {
                this.isBotDetected = true;
                this.flags.add("HONEYTRAP_TRIGGERED");
            }
            window.removeEventListener(trapType, handler);
        };
        window.addEventListener(trapType, handler);
        setTimeout(() => {
            try {
                window.dispatchEvent(new CustomEvent(trapType));
            } catch(e) {}
        }, 500);
    }

    generatePayload() {
        const uptime = Date.now() - this.startTime;
        const data = {
            b: this.isBotDetected,
            u: uptime,
            k: this.secretKey,
            v: "5.0"
        };

        const raw = JSON.stringify(data);
        const encoded = btoa(raw.split('').map(c => 
            String.fromCharCode(c.charCodeAt(0) ^ this.secretKey.charCodeAt(0))
        ).join(''));

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
