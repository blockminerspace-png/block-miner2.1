/**
 * When the user explicitly disconnects the wallet in the UI, we persist that choice
 * in sessionStorage so a full page reload does not auto-restore from eth_accounts
 * (injected) or re-sync WalletConnect before the user taps Connect again.
 */
export const WALLET_SESSION_CLEARED_BY_USER_KEY = 'bm_wallet_user_cleared_session_v1';

export function isWalletSessionClearedByUser() {
    if (typeof window === 'undefined') return false;
    try {
        return sessionStorage.getItem(WALLET_SESSION_CLEARED_BY_USER_KEY) === '1';
    } catch {
        return false;
    }
}

export function markWalletSessionClearedByUser() {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(WALLET_SESSION_CLEARED_BY_USER_KEY, '1');
    } catch {
        /* private / blocked storage */
    }
}

export function clearWalletSessionClearedByUserFlag() {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(WALLET_SESSION_CLEARED_BY_USER_KEY);
    } catch {
        /* ignore */
    }
}
