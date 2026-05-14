/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    WALLET_SESSION_CLEARED_BY_USER_KEY,
    clearWalletSessionClearedByUserFlag,
    isWalletSessionClearedByUser,
    markWalletSessionClearedByUser,
} from './walletSessionPreference';

describe('walletSessionPreference', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('marks and reads cleared session flag', () => {
        expect(isWalletSessionClearedByUser()).toBe(false);
        markWalletSessionClearedByUser();
        expect(sessionStorage.getItem(WALLET_SESSION_CLEARED_BY_USER_KEY)).toBe('1');
        expect(isWalletSessionClearedByUser()).toBe(true);
    });

    it('clears flag', () => {
        markWalletSessionClearedByUser();
        clearWalletSessionClearedByUserFlag();
        expect(isWalletSessionClearedByUser()).toBe(false);
    });
});
