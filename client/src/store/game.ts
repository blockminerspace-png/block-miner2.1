import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { api } from './auth';
import type { MiningSocketStats } from '../types/miningSocket';
import type { DashboardBlockRow } from '../types/dashboardStats';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function readAxiosMessage(err: unknown, fallback: string): string {
  if (!isRecord(err)) return fallback;
  const resp = err.response;
  if (!isRecord(resp)) return fallback;
  const data = resp.data;
  if (!isRecord(data)) return fallback;
  const msg = data.message;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

function mergeMiningStats(
  prev: MiningSocketStats | null | undefined,
  payload: MiningSocketStats,
): MiningSocketStats {
  const currentHistory = prev?.blockHistory ?? [];
  const incomingHistory = payload.blockHistory ?? [];

  const incomingAllZero = incomingHistory.every((b) => (Number(b.userReward) || 0) === 0);
  const currentHasReward = currentHistory.some((b) => (Number(b.userReward) || 0) > 0);
  const shouldKeepCurrentHistory = incomingAllZero && currentHasReward;

  const blockHistory: DashboardBlockRow[] = shouldKeepCurrentHistory ? currentHistory : incomingHistory;

  return {
    ...payload,
    miner: payload.miner ?? prev?.miner ?? undefined,
    blockHistory,
  };
}

export interface MiningGameStore {
  machines: unknown[];
  vaultItems: unknown[];
  vaultLoading: boolean;
  vaultError: string | null;
  inventory: unknown[];
  racks: Record<string, string>;
  stats: MiningSocketStats | null;
  messages: unknown[];
  privateMessages: unknown[];
  conversations: unknown[];
  notifications: unknown[];
  activePrivateUser: unknown | null;
  socket: Socket | null;
  isLoading: boolean;
  isChatOpen: boolean;
  isSidebarOpen: boolean;
  unreadPms: number;
  hasMention: boolean;

  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  toggleSidebar: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  clearMention: () => void;
  clearUnreadPms: () => void;
  setActivePrivateUser: (user: unknown) => void;
  clearActivePrivateUser: () => void;

  initSocket: () => void;
  fetchMachines: () => Promise<void>;
  fetchVault: () => Promise<void>;
  fetchInventory: () => Promise<void>;
  fetchRacks: () => Promise<void>;
  fetchMessages: () => Promise<void>;
  fetchPrivateMessages: (targetUserId: number | string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string | number) => Promise<void>;
  sendMessage: (message: string, replyToId?: string | null) => Promise<UnknownRecord>;
  sendPrivateMessage: (receiverId: number | string, message: string) => Promise<UnknownRecord>;
  installMachine: (slotIndex: number, inventoryId: number | string) => Promise<UnknownRecord>;
  removeMachine: (machineId: number | string) => Promise<UnknownRecord>;
  toggleMachine: (machineId: number | string, isActive: boolean) => Promise<UnknownRecord>;
  moveMachine: (machineId: number | string, targetSlotIndex: number) => Promise<UnknownRecord>;
  fetchAll: () => Promise<void>;
}

export const useGameStore = create<MiningGameStore>()((set, get) => ({
  machines: [],
  vaultItems: [],
  vaultLoading: false,
  vaultError: null,
  inventory: [],
  racks: {},
  stats: null,
  messages: [],
  privateMessages: [],
  conversations: [],
  notifications: [],
  activePrivateUser: null,
  socket: null,
  isLoading: true,
  isChatOpen: false,
  isSidebarOpen: false,

  unreadPms: 0,
  hasMention: false,

  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen, hasMention: false })),
  openChat: () => set({ isChatOpen: true, hasMention: false }),
  closeChat: () => set({ isChatOpen: false }),

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),

  clearMention: () => set({ hasMention: false }),
  clearUnreadPms: () => set({ unreadPms: 0 }),

  setActivePrivateUser: (user) => set({ activePrivateUser: user }),
  clearActivePrivateUser: () => set({ activePrivateUser: null }),

  initSocket: () => {
    if (get().socket) return;

    const socket = io('/', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 14,
      reconnectionDelay: 750,
      reconnectionDelayMax: 20000,
      timeout: Math.min(60000, Number.parseInt(String(import.meta.env.VITE_API_TIMEOUT_MS || '25000'), 10) || 25000),
    });

    socket.on('connect', () => {
      const cookies = document.cookie.split(';').reduce<Record<string, string>>((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});
      const token = cookies.blockminer_access;

      socket.emit('miner:join', { token }, (response: unknown) => {
        if (!isRecord(response) || !response.ok) return;
        const state = response.state;
        if (!isRecord(state)) return;
        set((s) => ({
          stats: {
            ...(state as unknown as MiningSocketStats),
            miner: (state.miner as MiningSocketStats['miner']) ?? s.stats?.miner,
          },
        }));
      });
    });

    socket.on('state:update', (payload: unknown) => {
      if (!isRecord(payload)) return;
      set((state) => ({
        stats: mergeMiningStats(state.stats, payload as MiningSocketStats),
      }));
    });

    socket.on('miner:update', (minerPayload: unknown) => {
      if (!isRecord(minerPayload)) return;
      set((state) => ({
        stats: state.stats
          ? { ...state.stats, miner: minerPayload as MiningSocketStats['miner'] }
          : ({ miner: minerPayload } as MiningSocketStats),
      }));
    });

    socket.on('inventory:update', (payload: unknown) => {
      if (isRecord(payload) && Array.isArray(payload.inventory)) set({ inventory: payload.inventory });
      else void get().fetchInventory();
    });

    socket.on('machines:update', (payload: unknown) => {
      if (isRecord(payload) && Array.isArray(payload.machines)) set({ machines: payload.machines });
      else void get().fetchMachines();
    });

    socket.on('vault:update', (payload: unknown) => {
      if (isRecord(payload) && Array.isArray(payload.vault)) set({ vaultItems: payload.vault, vaultError: null });
      else void get().fetchVault();
    });

    socket.on('chat:new-message', (msg: unknown) => {
      try {
        const raw = localStorage.getItem('user-storage');
        const currentUser = raw ? (JSON.parse(raw) as { state?: { user?: { username?: string; name?: string } } })?.state?.user : undefined;
        const text = isRecord(msg) && typeof msg.message === 'string' ? msg.message : '';
        if (currentUser && text.includes(`@${currentUser.username || currentUser.name || ''}`)) {
          if (!get().isChatOpen) set({ hasMention: true });
        }
      } catch {
        /* ignore corrupt localStorage */
      }
      void get().fetchMessages();
    });

    socket.on('chat:new-pm', (pm: unknown) => {
      if (!isRecord(pm)) return;
      const activeUser = get().activePrivateUser as { id?: number } | null;
      let currentUser: { id?: number } | undefined;
      try {
        const raw = localStorage.getItem('user-storage');
        currentUser = raw
          ? (JSON.parse(raw) as { state?: { user?: { id?: number } } })?.state?.user
          : undefined;
      } catch {
        currentUser = undefined;
      }
      const receiverId = Number(pm.receiverId);
      const senderId = Number(pm.senderId);
      if (receiverId === currentUser?.id && (!get().isChatOpen || activeUser?.id !== senderId)) {
        set((s) => ({ unreadPms: s.unreadPms + 1 }));
      }
      if (activeUser && (senderId === activeUser.id || receiverId === activeUser.id)) {
        void get().fetchPrivateMessages(activeUser.id);
      }
      void get().fetchConversations();
    });

    socket.on('notification:new', (notification: unknown) => {
      set((state) => ({
        notifications: [notification, ...state.notifications],
      }));
    });

    set({ socket });
  },

  fetchMachines: async () => {
    try {
      const res = await api.get<{ ok?: boolean; machines?: unknown[] }>('/machines');
      if (res.data.ok && Array.isArray(res.data.machines)) set({ machines: res.data.machines });
    } catch (err) {
      console.error(err);
    }
  },

  fetchVault: async () => {
    set({ vaultLoading: true, vaultError: null });
    try {
      const res = await api.get<{ ok?: boolean; vault?: unknown[] }>('/vault');
      if (res.data?.ok) {
        const rows = Array.isArray(res.data.vault) ? res.data.vault : [];
        set({ vaultItems: rows, vaultError: null });
      } else {
        set({ vaultError: 'LOAD_FAILED' });
      }
    } catch (err) {
      console.error('fetchVault:', err);
      set({ vaultError: 'NETWORK' });
    } finally {
      set({ vaultLoading: false });
    }
  },

  fetchInventory: async () => {
    try {
      const res = await api.get<{ ok?: boolean; inventory?: unknown[] }>('/inventory');
      if (res.data.ok && Array.isArray(res.data.inventory)) set({ inventory: res.data.inventory });
    } catch (err) {
      console.error(err);
    }
  },

  fetchRacks: async () => {
    try {
      const res = await api.get<{ ok?: boolean; racks?: { rack_index: number; custom_name: string }[] }>('/racks');
      if (res.data.ok && res.data.racks) {
        const racksObj: Record<string, string> = {};
        res.data.racks.forEach((r) => {
          racksObj[String(r.rack_index)] = r.custom_name;
        });
        set({ racks: racksObj });
      }
    } catch (err) {
      console.error(err);
    }
  },

  fetchMessages: async () => {
    try {
      const res = await api.get<{ ok?: boolean; messages?: unknown[] }>('/chat/messages');
      if (res.data.ok && Array.isArray(res.data.messages)) set({ messages: res.data.messages });
    } catch (err) {
      console.error(err);
    }
  },

  fetchPrivateMessages: async (targetUserId) => {
    try {
      const res = await api.get<{ ok?: boolean; messages?: unknown[] }>(`/chat/private/${targetUserId}`);
      if (res.data.ok && Array.isArray(res.data.messages)) set({ privateMessages: res.data.messages });
    } catch (err) {
      console.error(err);
    }
  },

  fetchConversations: async () => {
    try {
      const res = await api.get<{ ok?: boolean; conversations?: unknown[] }>('/chat/conversations');
      if (res.data.ok && Array.isArray(res.data.conversations)) set({ conversations: res.data.conversations });
    } catch (err) {
      console.error(err);
    }
  },

  fetchNotifications: async () => {
    try {
      const res = await api.get<{ ok?: boolean; notifications?: unknown[] }>('/notifications');
      if (res.data.ok) set({ notifications: Array.isArray(res.data.notifications) ? res.data.notifications : [] });
    } catch (err) {
      console.error(err);
    }
  },

  markNotificationRead: async (id) => {
    try {
      const res = await api.post<{ ok?: boolean }>(`/notifications/read/${id}`);
      if (res.data.ok) {
        if (id === 'all') {
          set((state) => ({
            notifications: state.notifications.map((n) =>
              isRecord(n) ? { ...n, isRead: true } : n,
            ),
          }));
        } else {
          set((state) => ({
            notifications: state.notifications.map((n) =>
              isRecord(n) && n.id === id ? { ...n, isRead: true } : n,
            ),
          }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  },

  sendMessage: async (message, replyToId = null) => {
    try {
      const res = await api.post('/chat/send', { message, replyToId });
      return res.data as UnknownRecord;
    } catch (err: unknown) {
      return { ok: false, message: readAxiosMessage(err, 'Error sending message') };
    }
  },

  sendPrivateMessage: async (receiverId, message) => {
    try {
      const res = await api.post('/chat/send-private', { receiverId, message });
      const data = res.data as UnknownRecord;
      if (isRecord(data) && data.ok) {
        void get().fetchPrivateMessages(receiverId);
        void get().fetchConversations();
      }
      return data;
    } catch (err: unknown) {
      return { ok: false, message: readAxiosMessage(err, 'Error sending PM') };
    }
  },

  installMachine: async (slotIndex, inventoryId) => {
    try {
      const res = await api.post('/inventory/install', { slotIndex, inventoryId });
      const data = res.data as UnknownRecord;
      if (isRecord(data) && data.ok) {
        void get().fetchMachines();
        void get().fetchInventory();
      }
      return data;
    } catch {
      return { ok: false };
    }
  },

  removeMachine: async (machineId) => {
    try {
      const res = await api.post('/machines/remove', { machineId });
      const data = res.data as UnknownRecord;
      if (isRecord(data) && data.ok) {
        void get().fetchMachines();
        void get().fetchInventory();
      }
      return data;
    } catch {
      return { ok: false };
    }
  },

  toggleMachine: async (machineId, isActive) => {
    try {
      const res = await api.post('/machines/toggle', { machineId, isActive });
      const data = res.data as UnknownRecord;
      if (isRecord(data) && data.ok) void get().fetchMachines();
      return data;
    } catch {
      return { ok: false };
    }
  },

  moveMachine: async (machineId, targetSlotIndex) => {
    try {
      const res = await api.post('/machines/move', { machineId, targetSlotIndex });
      const data = res.data as UnknownRecord;
      if (isRecord(data) && data.ok) void get().fetchMachines();
      return data;
    } catch {
      return { ok: false, message: 'Server error' };
    }
  },

  fetchAll: async () => {
    set({ isLoading: true });
    await Promise.all([
      get().fetchMachines(),
      get().fetchInventory(),
      get().fetchRacks(),
      get().fetchMessages(),
      get().fetchNotifications(),
    ]);
    set({ isLoading: false });
  },
}));
