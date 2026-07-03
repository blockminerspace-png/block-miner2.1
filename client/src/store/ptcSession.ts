import { create } from 'zustand';

export type PtcSessionStatus = 'idle' | 'opening' | 'viewing' | 'paused' | 'completed' | 'cancelled' | 'claimed';

export interface PtcSessionInfo {
  sessionId: string;
  adId: number;
  adTitle: string;
  adUrl: string;
  adType: 'window' | 'iframe';
  requiredSeconds: number;
  rewardShib: string;
}

interface PtcSessionStore {
  session: PtcSessionInfo | null;
  status: PtcSessionStatus;
  accumulatedMs: number; // server-confirmed accumulated viewing ms
  isViewing: boolean;    // user is currently away from BlockMiner (timer running)

  setSession: (info: PtcSessionInfo, status?: PtcSessionStatus, accumulatedMs?: number) => void;
  setStatus: (status: PtcSessionStatus) => void;
  setIsViewing: (v: boolean) => void;
  updateAccumulatedMs: (ms: number) => void;
  clear: () => void;
}

export const usePtcSessionStore = create<PtcSessionStore>()((set) => ({
  session: null,
  status: 'idle',
  accumulatedMs: 0,
  isViewing: false,

  setSession: (info, status = 'opening', accumulatedMs = 0) =>
    set({ session: info, status, accumulatedMs, isViewing: false }),

  setStatus: (status) => set({ status }),

  setIsViewing: (v) => set({ isViewing: v }),

  updateAccumulatedMs: (ms) => set({ accumulatedMs: ms }),

  clear: () => set({ session: null, status: 'idle', accumulatedMs: 0, isViewing: false }),
}));
