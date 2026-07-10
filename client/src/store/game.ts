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
  const rawIncoming = payload.blockHistory;
  const incomingHistory = Array.isArray(rawIncoming) ? rawIncoming : null;

  if (incomingHistory === null) {
    return {
      ...payload,
      miner: payload.miner ?? prev?.miner ?? undefined,
      blockHistory: currentHistory
    };
  }

  if (incomingHistory.length === 0 && currentHistory.length > 0) {
    return {
      ...payload,
      miner: payload.miner ?? prev?.miner ?? undefined,
      blockHistory: currentHistory
    };
  }

  const incomingAllZero = incomingHistory.every((b) => {
    if (!isRecord(b)) return true;
    const ur = Number(b.userReward) || 0;
    const tr = Number(b.totalReward) || 0;
    const failed = Boolean(b.persistFailed);
    return ur === 0 && tr === 0 && !failed;
  });
  const currentHasReward = currentHistory.some((b) => (Number(b.userReward) || 0) > 0);
  const shouldKeepCurrentHistory = incomingAllZero && currentHasReward;

  const blockHistory: DashboardBlockRow[] = shouldKeepCurrentHistory ? currentHistory : incomingHistory;

  return {
    ...payload,
    miner: payload.miner ?? prev?.miner ?? undefined,
    blockHistory,
  };
}

/** Chat payloads shaped for the dashboard sidebar (server fields may omit keys). */
export interface ChatReplyPreview {
  id?: string | number;
  username?: string;
  message?: string;
}

export interface ChatGlobalMessage {
  id: string | number;
  userId?: string | number;
  username?: string;
  message: string;
  createdAt?: string | number | Date;
  replyTo?: ChatReplyPreview | null;
}

export interface ChatPrivateMessage {
  senderId?: string | number;
  message: string;
  createdAt?: string | number | Date;
}

export interface ChatConversation {
  userId: string | number;
  username: string;
  lastMessageAt?: string | number | Date;
}

export interface ChatPrivateUserRef {
  id: string | number;
  username: string;
}

export interface MiningGameStore {
  machines: unknown[];
  vaultItems: unknown[];
  vaultLoading: boolean;
  vaultError: string | null;
  inventory: unknown[];
  racks: Record<string, string>;
  stats: MiningSocketStats | null;
  messages: ChatGlobalMessage[];
  privateMessages: ChatPrivateMessage[];
  conversations: ChatConversation[];
  notifications: unknown[];
  activePrivateUser: ChatPrivateUserRef | null;
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
  setActivePrivateUser: (user: ChatPrivateUserRef | null) => void;
  clearActivePrivateUser: () => void;

  initSocket: () => void;
  disconnectSocket: () => void;
  fetchMachines: () => Promise<void>;
  fetchVault: () => Promise<void>;
  fetchInventory: () => Promise<void>;
  fetchRacks: () => Promise<void>;
  fetchMessages: () => Promise<void>;
  fetchPrivateMessages: (targetUserId: number | string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string | number) => Promise<void>;
  sendMessage: (message: string, replyToId?: string | number | null) => Promise<UnknownRecord>;
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

    const runtimeSocketMs =
      typeof window !== 'undefined' && window.__BLOCKMINER_ENV__?.VITE_SOCKET_TIMEOUT_MS
        ? window.__BLOCKMINER_ENV__.VITE_SOCKET_TIMEOUT_MS
        : import.meta.env.VITE_SOCKET_TIMEOUT_MS;
    const socket = io('/', {
      withCredentials: true,
      // Polling first: avoids noisy "WebSocket failed" in DevTools when nginx/proxy delays the upgrade.
      transports: ['polling', 'websocket'],
      // Never give up — laptop sleep, mobile handoff, and long tab-background must all recover transparently.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: Math.max(
        60_000,
        Number.parseInt(String(runtimeSocketMs || '180000'), 10) || 180_000,
      ),
    });

    // When the tab returns to the foreground, browsers may have suspended timers long enough
    // for the server to have already declared the socket dead. Force an immediate reconnect
    // attempt instead of waiting for the next scheduled backoff tick.
    if (typeof document !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'visible' && !socket.connected) {
          socket.connect();
        }
      };
      const onOnline = () => {
        if (!socket.connected) socket.connect();
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('online', onOnline);
      window.addEventListener('focus', onVisibility);
      // Stored so future disconnectSocket() can clean up.
      (socket as unknown as { __bmCleanup?: () => void }).__bmCleanup = () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('focus', onVisibility);
      };
    }

    // Emit a miner:join using the current cookie value. Extracted so we can re-run it
    // after a silent HTTP token refresh triggered by auth:expired.
    const joinWithCookieToken = () => {
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
    };

    // Server signals when miner:join failed because the access token expired.
    // Trigger a silent HTTP refresh via the axios interceptor (any authed request works),
    // then re-run miner:join. If the refresh cookie is also gone, this stays quiet and
    // the user only sees stale data until they log in — no forced reload.
    socket.on('auth:expired', () => {
      void api
        .post('/auth/refresh', {})
        .then(() => {
          if (socket.connected) joinWithCookieToken();
        })
        .catch(() => {
          /* refresh cookie gone — user must re-login manually */
        });
    });

    socket.on('connect', () => {
      joinWithCookieToken();
      void get().fetchMachines();
      void get().fetchVault();
      void get().fetchInventory();
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
      const activeUser = get().activePrivateUser;
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

  disconnectSocket: () => {
    const socket = get().socket;
    if (!socket) return;
    const cleanup = (socket as unknown as { __bmCleanup?: () => void }).__bmCleanup;
    if (typeof cleanup === 'function') cleanup();
    socket.removeAllListeners();
    socket.disconnect();
    set({ socket: null });
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
      if (res.data.ok && Array.isArray(res.data.messages)) set({ messages: res.data.messages as ChatGlobalMessage[] });
    } catch (err) {
      console.error(err);
    }
  },

  fetchPrivateMessages: async (targetUserId: number | string) => {
    try {
      const res = await api.get<{ ok?: boolean; messages?: unknown[] }>(`/chat/private/${targetUserId}`);
      if (res.data.ok && Array.isArray(res.data.messages))
        set({ privateMessages: res.data.messages as ChatPrivateMessage[] });
    } catch (err) {
      console.error(err);
    }
  },

  fetchConversations: async () => {
    try {
      const res = await api.get<{ ok?: boolean; conversations?: unknown[] }>('/chat/conversations');
      if (res.data.ok && Array.isArray(res.data.conversations))
        set({ conversations: res.data.conversations as ChatConversation[] });
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
