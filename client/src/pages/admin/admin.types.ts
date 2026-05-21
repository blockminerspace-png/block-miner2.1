/** Shared admin UI types (client only; server remains authoritative). */

export type AdminUserListItem = {
  id: string | number;
  username: string | null;
  email: string | null;
  status?: string;
  createdAt?: string;
};

export type AdminPagination = {
  page: number;
  limit: number;
  total: number;
};

export type AdminAuthCheckResponse = {
  ok: boolean;
};

/** POST /admin/auth/login — shape used by AdminLogin (server is authoritative). */
export type AdminLoginResponse = {
  ok: boolean;
  message?: string;
  code?: string;
};

export type AdminLoginRequestBody = {
  email: string;
  securityCode: string;
  password: string;
};

/** GET /admin/stats — optional fields mirror dashboard usage. */
export type AdminDashboardStats = {
  usersTotal?: number;
  usersNew24h?: number;
  minersActive?: number;
  balanceTotal?: number;
  serverCpuUsagePercent?: number;
  serverCpuCores?: number;
  serverMemoryUsedBytes?: number;
  serverMemoryTotalBytes?: number;
  serverMemoryUsagePercent?: number;
  serverDiskMetricsAvailable?: boolean;
  serverDiskUsedBytes?: number;
  serverDiskTotalBytes?: number;
  serverDiskUsagePercent?: number;
};

export type AdminDashboardUserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  is_banned: boolean;
};

export type AdminDashboardWithdrawalRow = {
  id: number | string;
  userId?: number;
  amount: number | string;
  address: string;
  status: string;
  user?: { username?: string | null; email?: string | null };
};

export type AdminDashboardAuditRow = {
  id?: number | string;
  action?: string | null;
  user_email?: string | null;
  user_id?: number | null;
  ip?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

/** Row from GET /admin/mini-pass/seasons list. */
export type AdminMiniPassSeasonListRow = {
  id: number | string;
  slug?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  maxLevel?: number;
  xpPerLevel?: number;
  isActive?: boolean;
  _count?: { levelRewards?: number; missions?: number };
};

/** Level reward row from GET `/admin/mini-pass/seasons/:id` (`adminGetMiniPassSeason`). */
export type AdminMiniPassLevelRewardRow = {
  id: number;
  level: number;
  rewardKind: string;
  minerId?: number | null;
  eventMinerId?: number | null;
  hashRate?: string | number | null;
  hashRateDays?: string | number | null;
  blkAmount?: string | number | null;
  polAmount?: string | number | null;
  titleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  miner?: { id?: number; name?: string | null; isActive?: boolean } | null;
  eventMiner?: { id?: number; name?: string | null; isActive?: boolean } | null;
};

/** Mission row from GET `/admin/mini-pass/seasons/:id`. */
export type AdminMiniPassMissionRow = {
  id: number;
  cadence: string;
  missionType: string;
  targetValue: string | number;
  xpReward: number;
  titleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  descriptionI18n?: { en?: string; ptBR?: string; es?: string } | null;
  gameSlug?: string | null;
  sortOrder?: number;
};

export type AdminMiniPassSeasonDetail = {
  id: number;
  slug?: string;
  titleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  subtitleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  startsAt?: string | Date;
  endsAt?: string | Date;
  maxLevel?: number;
  xpPerLevel?: number;
  buyLevelPricePol?: string | number | null;
  completePassPricePol?: string | number | null;
  bannerImageUrl?: string | null;
  isActive?: boolean;
  levelRewards?: AdminMiniPassLevelRewardRow[];
  missions?: AdminMiniPassMissionRow[];
};

export type AdminMiniPassSeasonGetResponse =
  | { ok: true; season: AdminMiniPassSeasonDetail }
  | { ok: false; message?: string };

export type AdminMiniPassSeasonWriteResponse =
  | { ok: true; season?: AdminMiniPassSeasonDetail & { id?: number } }
  | { ok: false; message?: string };

/** Row from GET `/admin/miners` (catalog search for reward pickers). */
export type AdminMinerCatalogRow = {
  id: string | number;
  name?: string | null;
  baseHashRate?: string | number | null;
  slotSize?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
};

export type AdminMinersListResponse = {
  miners?: AdminMinerCatalogRow[];
};

/** Query params for GET `/admin/support/:id/player-dossier` (mirrors server `parseDossierPagination`). */
export type AdminSupportPlayerDossierParams = {
  limit: number;
  depositsPage: number;
  ccpaymentPage: number;
  depositTicketsPage: number;
  withdrawalsPage: number;
  payoutsPage: number;
  minersPage: number;
  inventoryPage: number;
  vaultPage: number;
};

export type AdminSupportPlayerDossierTicketPublic = {
  id: number;
  name?: string | null;
  email?: string | null;
};

/** User summary embedded in support player dossier. */
export type AdminSupportDossierSummary = {
  id: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  walletAddress?: string | null;
  registrationIp?: string | null;
  lastIp?: string | null;
  isBanned?: boolean;
  createdAt?: string | Date | null;
  lastLoginAt?: string | Date | null;
  polBalance?: number | string | null;
  blkBalance?: number | string | null;
};

export type AdminSupportDossierIpOverlapUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | Date | null;
  registrationIp?: string | null;
  ip?: string | null;
  ipOverlapReasons?: string[];
};

export type AdminSupportDossierProfileWalletDupeUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierChainOverlapOtherUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | Date | null;
  via: string[];
};

export type AdminSupportDossierChainOverlapBlock = {
  address: string;
  otherUsers: AdminSupportDossierChainOverlapOtherUser[];
};

/** Result of `buildDossierAccountCollisions` (nullable slice on server). */
export type AdminSupportDossierAccountCollisions = {
  hasRisk: boolean;
  registrationIp?: string | null;
  lastIp?: string | null;
  ipOverlapUsers?: AdminSupportDossierIpOverlapUser[];
  profileWalletDuplicateUsers?: AdminSupportDossierProfileWalletDupeUser[];
  chainAddressOverlaps?: AdminSupportDossierChainOverlapBlock[];
};

export type AdminSupportDossierPaged<T> = {
  rows: T[];
  total: number;
  page?: number;
  limit?: number;
};

export type AdminSupportDossierDepositRow = {
  id: number | string;
  amount?: number | string | null;
  status?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierCcpaymentRow = {
  id: number | string;
  amountPol?: number | string | null;
  credited?: boolean;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierDepositTicketRow = {
  id: number | string;
  status?: string | null;
  walletAddress?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierWithdrawalRow = {
  id: number | string;
  amount?: number | string | null;
  status?: string | null;
  address?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierPayoutRow = {
  id: number | string;
  amountPol?: number | string | null;
  source?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierMinerRow = {
  id: number | string;
  slotIndex?: number;
  level?: number | string;
  hashRate?: number | string;
  slotSize?: number | string;
  isActive?: boolean;
  displayName?: string;
  imageUrl?: string | null;
  minerId?: number | null;
};

/** Rack / inventory / vault machine cards in dossier (overlapping fields). */
export type AdminSupportDossierMachineCardRow = {
  id: number | string;
  slotIndex?: number;
  level?: number | string;
  hashRate?: number | string;
  slotSize?: number | string;
  isActive?: boolean;
  displayName?: string;
  imageUrl?: string | null;
  acquiredAt?: string | Date | null;
  expiresAt?: string | Date | null;
  storedAt?: string | Date | null;
};

/** `dossier` object when ticket is linked to a user with data (server `supportPlayerDossierService`). */
export type AdminSupportPlayerDossierData = {
  summary: AdminSupportDossierSummary;
  walletAddresses: string[];
  accountCollisions?: AdminSupportDossierAccountCollisions | null;
  depositTransactions: AdminSupportDossierPaged<AdminSupportDossierDepositRow>;
  ccpaymentDeposits: AdminSupportDossierPaged<AdminSupportDossierCcpaymentRow>;
  depositTickets: AdminSupportDossierPaged<AdminSupportDossierDepositTicketRow>;
  withdrawalTransactions: AdminSupportDossierPaged<AdminSupportDossierWithdrawalRow>;
  payouts: AdminSupportDossierPaged<AdminSupportDossierPayoutRow>;
  miners: AdminSupportDossierPaged<AdminSupportDossierMinerRow>;
  inventory?: AdminSupportDossierPaged<AdminSupportDossierMachineCardRow>;
  vault?: AdminSupportDossierPaged<AdminSupportDossierMachineCardRow>;
};

/**
 * Successful GET `/admin/support/:id/player-dossier` body (parent stores `res.data` when `ok`).
 * Variants: guest ticket, orphan user id, or full dossier.
 */
export type AdminSupportPlayerDossierBundle = {
  ok: true;
  linked: boolean;
  orphanTicket?: boolean;
  userId?: number;
  ticket?: AdminSupportPlayerDossierTicketPublic;
  dossier: AdminSupportPlayerDossierData | null;
};

export type AdminSupportPlayerDossierProps = {
  bundle: AdminSupportPlayerDossierBundle | null;
  loading: boolean;
  error: boolean;
  params: AdminSupportPlayerDossierParams;
  onParamsChange: (patch: Partial<AdminSupportPlayerDossierParams>) => void;
  onRetry: () => void;
};

/** Image row attached to support message / reply (admin upload + ticket payloads). */
export type AdminSupportAttachment = {
  url: string;
  mimeType?: string;
};

export type AdminSupportUserSnippet = {
  username?: string | null;
  email?: string | null;
};

/** Row from GET `/admin/support` (list). */
export type AdminSupportInboxMessage = {
  id: number;
  userId?: number | null;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  message?: string | null;
  isRead?: boolean;
  isReplied?: boolean;
  createdAt: string | Date;
  user?: AdminSupportUserSnippet | null;
};

export type AdminSupportListApiResponse = {
  ok: boolean;
  messages?: AdminSupportInboxMessage[];
  page?: number;
  limit?: number;
  total?: number;
};

export type AdminSupportReplyEntry = {
  id: number;
  supportMessageId?: number;
  senderId?: number | null;
  isAdmin: boolean;
  createdAt: string | Date;
  body?: string | null;
  message?: string | null;
  attachments?: AdminSupportAttachment[];
};

/** GET `/admin/support/:id` after `enrichTicket` (parsed body + public replies). */
export type AdminSupportMessageDetail = AdminSupportInboxMessage & {
  body?: string | null;
  attachments?: AdminSupportAttachment[];
  reply?: string | null;
  replies?: AdminSupportReplyEntry[];
};

export type AdminSupportMessageApiResponse = {
  ok: boolean;
  message?: AdminSupportMessageDetail;
};

export type AdminSupportListFilter = "all" | "unread" | "pending" | "replied";

export type AdminSupportSubscribeAck = {
  ok?: boolean;
  message?: string;
};

export type AdminSupportSocketReplyPayload = {
  supportMessageId?: number | string;
  reply?: AdminSupportReplyEntry;
};

export type AdminSupportUploadImageResponse = {
  ok?: boolean;
  url?: string;
  mimeType?: string;
};

export type AdminSupportReplyPostResponse = {
  ok: boolean;
  message?: string;
};

/** Narrow axios `data` after `ok === true` for player dossier. */
export function isAdminSupportPlayerDossierBundle(value: unknown): value is AdminSupportPlayerDossierBundle {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return o.ok === true && typeof o.linked === "boolean";
}

/** Row from GET `/admin/offer-events` (`adminListOfferEvents`). */
export type AdminOfferEventListRow = {
  id: number;
  title: string;
  description?: string;
  imageUrl?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive: boolean;
  deletedAt?: string | Date | null;
  minerCount?: number;
  purchaseCount?: number;
};

export type AdminOfferEventsListSuccess = {
  ok: true;
  page: number;
  pageSize: number;
  total: number;
  events: AdminOfferEventListRow[];
};

export type AdminOfferEventsListResponse = AdminOfferEventsListSuccess | { ok: false; message?: string };

/** Tabs on `/admin/offer-events/:id?tab=`. */
export type AdminOfferEventManageTab = "event" | "miners" | "sales";

/** Form state for create/update offer event (admin UI). */
export type AdminOfferEventManageFormState = {
  title: string;
  description: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

/** Event row from GET `/admin/offer-events/:id` (Prisma `offerEvent` + optional `_count`). */
export type AdminOfferEventDetail = {
  id: number;
  title: string;
  description: string;
  imageUrl?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive: boolean;
  deletedAt?: string | Date | null;
  _count?: { miners: number; purchases: number };
};

export type AdminOfferEventGetResponse = { ok: true; event: AdminOfferEventDetail } | { ok: false; message?: string };

export type AdminOfferEventMutationResponse =
  | { ok: true; event?: AdminOfferEventDetail; message?: string }
  | { ok: false; message?: string; errors?: unknown };

/** Event miner row from GET `/admin/offer-events/:eventId/miners`. */
export type AdminOfferEventMinerRow = {
  id: number;
  eventId?: number;
  name: string;
  description: string;
  imageUrl?: string | null;
  price: string | number;
  hashRate: number;
  currency: string;
  stockUnlimited: boolean;
  stockCount?: number | null;
  soldCount?: number;
  slotSize?: number;
  isActive: boolean;
  isFree: boolean;
  claimLimitPerUser?: number;
};

export type AdminOfferEventMinersListResponse =
  | { ok: true; miners: AdminOfferEventMinerRow[]; event?: AdminOfferEventDetail }
  | { ok: false; message?: string };

export type AdminOfferEventPurchaseUser = {
  id?: number;
  email?: string | null;
  username?: string | null;
  name?: string | null;
};

export type AdminOfferEventPurchaseRow = {
  id: number;
  userId: number;
  eventMinerId?: number;
  pricePaid: number;
  currency: string;
  createdAt: string | Date;
  user?: AdminOfferEventPurchaseUser | null;
  minerName?: string | null;
};

export type AdminOfferEventPurchasesListResponse =
  | { ok: true; purchases: AdminOfferEventPurchaseRow[]; page?: number; pageSize?: number; total?: number }
  | { ok: false; message?: string };

/** Local form for create/edit event miner modal. */
export type AdminOfferEventMinerFormState = {
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  hashRate: string;
  currency: string;
  stockUnlimited: boolean;
  stockCount: string;
  slotSize: 1 | 2;
  isActive: boolean;
  isFree: boolean;
  claimLimitPerUser: number | string;
};

/** GET `/admin/server-metrics` — `metrics` payload (see `adminController.getServerMetrics`). */
export type AdminServerMetricsSnapshot = {
  cpuUsagePercent: number;
  cpuCores: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryUsagePercent: number;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskUsagePercent: number | null;
  diskUnavailable: boolean;
  uptimeSeconds: number;
  platform: string;
  nodeVersion: string;
  processId: number;
};

export type AdminServerMetricsSuccessResponse = {
  ok: true;
  metrics: AdminServerMetricsSnapshot;
};

export type AdminServerMetricsErrorResponse = {
  ok: false;
  message?: string;
};

export type AdminServerMetricsResponse = AdminServerMetricsSuccessResponse | AdminServerMetricsErrorResponse;
