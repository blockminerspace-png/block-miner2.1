import { create } from 'zustand';

interface OfferwallTimerStore {
  offerTitle: string | null;
  elapsed: number;       // seconds accumulated (from useActiveViewSeconds)
  minSec: number;        // required view seconds
  isPaused: boolean;     // user is back on BlockMiner — timer paused
  isActive: boolean;     // a STARTED attempt with minSec > 0 is open
  canSubmit: boolean;    // elapsed >= minSec

  sync: (data: { offerTitle: string; elapsed: number; minSec: number; isPaused: boolean; canSubmit: boolean }) => void;
  clear: () => void;
}

export const useOfferwallTimerStore = create<OfferwallTimerStore>()((set) => ({
  offerTitle: null,
  elapsed: 0,
  minSec: 0,
  isPaused: false,
  isActive: false,
  canSubmit: false,

  sync: (data) => set({ ...data, isActive: true }),
  clear: () => set({ offerTitle: null, elapsed: 0, minSec: 0, isPaused: false, isActive: false, canSubmit: false }),
}));
