import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import type { TransparencyEntry, TransparencyTrackedWallet } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import {
  assertValidTransparencyWalletAddress,
  fetchTrackedWalletsSummary,
  fetchTrackedWalletsLive,
  fetchWalletNativeActivity
} from "../services/transparencyWalletService.js";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";

const VALID_CATEGORIES = ["infrastructure", "tooling", "marketing", "payroll", "legal", "misc"] as const;
const VALID_INCOME_CATEGORIES = ["sponsorship", "donation", "revenue", "investment_return", "other"] as const;
const VALID_PERIODS = ["daily", "monthly", "annual", "one_time"] as const;
const VALID_TYPES = ["expense", "income"] as const;
const VALID_CHAINS = ["polygon"] as const;
const VALID_DISPLAY_MODES = ["total_received", "current_balance", "total_sent"] as const;
const VALID_DIRECTIONS = ["in", "out"] as const;

function normalizeString(value: unknown, max = 5000): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeBool(value: unknown, fallback = false): boolean {
  if (value === true || value === false) return value;
  if (value == null) return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function normalizeDecimal(
  value: unknown,
  fieldName: string,
  { required = false, min = 0 }: { required?: boolean; min?: number } = {}
): number | null {
  if (value == null || value === "") {
    if (required) throw new Error(`${fieldName} é obrigatório.`);
    return null;
  }
  const n = Number.parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`${fieldName} é inválido.`);
  }
  return n;
}

function normalizeDate(value: unknown): Date | null {
  const s = normalizeString(value, 64);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Data da entrada inválida.");
  return d;
}

function normalizeEntryPayload(body: Record<string, unknown>, current: TransparencyEntry | null = null) {
  const typeRaw = normalizeString(body.type ?? current?.type ?? "expense", 20)?.toLowerCase();
  if (!typeRaw || !VALID_TYPES.includes(typeRaw as (typeof VALID_TYPES)[number])) throw new Error("Tipo inválido.");
  const type = typeRaw as (typeof VALID_TYPES)[number];

  const category = normalizeString(body.category ?? current?.category ?? "misc", 64)?.toLowerCase();
  const incomeCategory = normalizeString(body.incomeCategory ?? current?.incomeCategory ?? null, 64)?.toLowerCase();
  if (type === "expense" && (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number]))) {
    throw new Error("Categoria inválida.");
  }
  if (
    type === "income" &&
    incomeCategory &&
    !VALID_INCOME_CATEGORIES.includes(incomeCategory as (typeof VALID_INCOME_CATEGORIES)[number])
  ) {
    throw new Error("Categoria de receita inválida.");
  }

  const period = normalizeString(body.period ?? current?.period ?? "monthly", 20)?.toLowerCase();
  if (!period || !VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])) throw new Error("Período inválido.");

  const name = normalizeString(body.name ?? current?.name, 180);
  if (!name) throw new Error("Nome é obrigatório.");

  const amountUsd = normalizeDecimal(body.amountUsd ?? current?.amountUsd, "Valor em USD", { required: true, min: 0 });
  const amountOriginal = normalizeDecimal(body.amountOriginal ?? current?.amountOriginal, "Valor original", {
    required: false,
    min: 0
  });
  const fxRateUsd = normalizeDecimal(body.fxRateUsd ?? current?.fxRateUsd, "Taxa USD", { required: false, min: 0 });
  const currencyCode = normalizeString(body.currencyCode ?? current?.currencyCode ?? "USD", 16)?.toUpperCase();
  const direction = normalizeString(body.direction ?? current?.direction ?? null, 8)?.toLowerCase();
  if (direction && !VALID_DIRECTIONS.includes(direction as (typeof VALID_DIRECTIONS)[number])) throw new Error("Direção inválida.");

  const blockchain = normalizeString(body.blockchain ?? current?.blockchain ?? null, 32)?.toLowerCase();
  if (blockchain && !VALID_CHAINS.includes(blockchain as (typeof VALID_CHAINS)[number])) throw new Error("Blockchain inválida.");

  const walletAddress = normalizeString(body.walletAddress ?? current?.walletAddress ?? null, 128);
  const txHash = normalizeString(body.txHash ?? current?.txHash ?? null, 128);
  const referenceUrl = normalizeString(body.referenceUrl ?? current?.referenceUrl ?? null, 1000);
  const providerUrl = normalizeString(body.providerUrl ?? current?.providerUrl ?? null, 1000);
  const imageUrl = normalizeString(body.imageUrl ?? current?.imageUrl ?? null, 1000);

  if (walletAddress) assertValidTransparencyWalletAddress(walletAddress);
  if (txHash && !/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error("Hash da transação inválido.");
  if (referenceUrl) new URL(referenceUrl);
  if (providerUrl) new URL(providerUrl);
  if (imageUrl) new URL(imageUrl, "https://dummy.local");

  const catExpense = category && VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number]) ? category : "misc";

  return {
    type,
    category: type === "expense" ? catExpense : "misc",
    incomeCategory: type === "income" ? incomeCategory || "other" : null,
    name,
    description: normalizeString(body.description ?? current?.description ?? null, 4000),
    provider: normalizeString(body.provider ?? current?.provider ?? null, 180),
    providerUrl,
    imageUrl,
    amountUsd,
    amountOriginal,
    currencyCode,
    fxRateUsd,
    period,
    entryDate: normalizeDate(body.entryDate ?? current?.entryDate ?? null),
    direction,
    blockchain,
    walletAddress: walletAddress ? assertValidTransparencyWalletAddress(walletAddress) : null,
    txHash,
    referenceUrl,
    isOnChain: normalizeBool(body.isOnChain ?? current?.isOnChain, false),
    isPaid: normalizeBool(body.isPaid ?? current?.isPaid, true),
    isActive: normalizeBool(body.isActive ?? current?.isActive, true),
    notes: normalizeString(body.notes ?? current?.notes ?? null, 8000),
    sortOrder: Math.max(0, parseInt(String(body.sortOrder ?? current?.sortOrder ?? 0), 10) || 0)
  };
}

function normalizeTrackedWalletPayload(
  body: Record<string, unknown>,
  current: TransparencyTrackedWallet | null = null
) {
  const label = normalizeString(body.label ?? current?.label, 140);
  if (!label) throw new Error("Rótulo da carteira é obrigatório.");
  const addressRaw = assertValidTransparencyWalletAddress(String(body.address ?? current?.address ?? ""));
  if (!addressRaw) throw new Error("Endereço inválido.");
  const address = addressRaw;
  const chain = normalizeString(body.chain ?? current?.chain ?? "polygon", 32)?.toLowerCase();
  if (!chain || !VALID_CHAINS.includes(chain as (typeof VALID_CHAINS)[number])) throw new Error("Chain inválida.");
  const explorerBaseUrl =
    normalizeString(
      body.explorerBaseUrl ?? current?.explorerBaseUrl ?? "https://polygonscan.com/address",
      1000
    ) ?? "https://polygonscan.com/address";
  new URL(explorerBaseUrl);

  const sym = normalizeString(body.assetSymbol ?? current?.assetSymbol ?? "POL", 16)?.toUpperCase() || "POL";

  const displayMode = normalizeString(body.displayMode ?? current?.displayMode ?? "total_received", 32) ?? "total_received";
  if (!VALID_DISPLAY_MODES.includes(displayMode as (typeof VALID_DISPLAY_MODES)[number])) {
    throw new Error("Display mode inválido.");
  }

  return {
    label,
    address,
    chain,
    assetSymbol: sym,
    explorerBaseUrl,
    isActive: normalizeBool(body.isActive ?? current?.isActive, true),
    isPublic: normalizeBool(body.isPublic ?? current?.isPublic, true),
    includeInTotals: normalizeBool(body.includeInTotals ?? current?.includeInTotals, true),
    displayMode,
    sortOrder: Math.max(0, parseInt(String(body.sortOrder ?? current?.sortOrder ?? 0), 10) || 0)
  };
}

function prevalidateEntryPatch(body: unknown) {
  if (!body || typeof body !== "object") return;
  const b = body as Record<string, unknown>;

  if (b.type != null) {
    const type = normalizeString(b.type, 20)?.toLowerCase();
    if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) throw new Error("Tipo inválido.");
  }

  if (b.category != null) {
    const category = normalizeString(b.category, 64)?.toLowerCase();
    if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      throw new Error("Categoria inválida.");
    }
  }

  if (b.incomeCategory != null) {
    const incomeCategory = normalizeString(b.incomeCategory, 64)?.toLowerCase();
    if (
      !incomeCategory ||
      !VALID_INCOME_CATEGORIES.includes(incomeCategory as (typeof VALID_INCOME_CATEGORIES)[number])
    ) {
      throw new Error("Categoria de receita inválida.");
    }
  }

  if (b.period != null) {
    const period = normalizeString(b.period, 20)?.toLowerCase();
    if (!period || !VALID_PERIODS.includes(period as (typeof VALID_PERIODS)[number])) throw new Error("Período inválido.");
  }
}

function isPrismaRuntimeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  let code: unknown;
  if (error !== null && typeof error === "object" && "code" in error) {
    code = (error as { code: unknown }).code;
  }
  return Boolean(
    code ||
      message.includes("Invalid `prisma.") ||
      message.includes("SASL:") ||
      message.includes("Can't reach database server") ||
      message.includes("Authentication failed against database server")
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function errCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

async function getTrackedWallets(includeInactive = true) {
  return prisma.transparencyTrackedWallet.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
  });
}

function asBodyRecord(req: Request): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  return {};
}

const FALLBACK_GAME_WALLET = "0x9da76e16147cc728ab46f4403e6c1d4d718ea289";
const WALLET_STATS_CACHE_TTL_MS = 10 * 60 * 1000;
/** Transparency wallets are on-chain; 60 min is plenty — reduces Etherscan rate-limit pressure. */
const WALLETS_LIVE_CACHE_TTL_MS = 60 * 60 * 1000;
let _walletStatsCache: { result: unknown; expiresAt: number } | null = null;

export async function getPublicWalletStats(_req: Request, res: Response): Promise<void> {
  const now = Date.now();
  if (_walletStatsCache && _walletStatsCache.expiresAt > now) {
    res.json(_walletStatsCache.result);
    return;
  }

  try {
    const [settingsRow, firstPublicWallet] = await Promise.all([
      prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } }),
      prisma.transparencyTrackedWallet.findFirst({
        where: { isActive: true, isPublic: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const address = settingsRow?.address || firstPublicWallet?.address || FALLBACK_GAME_WALLET;
    const data = await fetchWalletNativeActivity(address, { pageSize: 100, maxPages: 100 });

    const result = {
      ok: true,
      address: data.address,
      apiKeyConfigured: data.apiKeyConfigured,
      totalInPol: data.summary.totalInPol,
      totalOutPol: data.summary.totalOutPol,
      totalInUsd: data.summary.totalInUsd,
      movementCount: data.summary.movementCount,
      polUsdPrice: data.summary.polUsdPrice,
      historyMayBeTruncated: data.summary.historyMayBeTruncated,
    };

    _walletStatsCache = { result, expiresAt: now + WALLET_STATS_CACHE_TTL_MS };
    res.json(result);
  } catch (e: unknown) {
    res.status(502).json({ ok: false, message: errMsg(e) || "Erro ao consultar a chain." });
  }
}

let _withdrawalStatsCache: { result: unknown; expiresAt: number } | null = null;

export async function getPublicWithdrawalStats(_req: Request, res: Response): Promise<void> {
  const now = Date.now();
  if (_withdrawalStatsCache && _withdrawalStatsCache.expiresAt > now) {
    res.json(_withdrawalStatsCache.result);
    return;
  }

  try {
    const [agg, senderGroups] = await Promise.all([
      prisma.transaction.aggregate({
        where: { type: "withdrawal", status: "completed" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.transaction.groupBy({
        by: ["fromAddress"],
        where: { type: "withdrawal", status: "completed", fromAddress: { not: null } },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    let polUsdPrice: number | null = null;
    try { polUsdPrice = Number(await getPolUsdPrice()); } catch { /* no-op */ }

    const totalPol = Number(agg._sum.amount ?? 0);
    const result = {
      ok: true,
      currency: "POL",
      network: "Polygon",
      totalPol,
      totalUsd: polUsdPrice != null ? Number((totalPol * polUsdPrice).toFixed(2)) : null,
      totalCount: agg._count.id,
      polUsdPrice,
      senderWallets: senderGroups
        .filter((r) => r.fromAddress)
        .map((r) => ({
          address: r.fromAddress as string,
          totalPol: Number(r._sum.amount ?? 0),
          count: r._count.id,
        })),
    };

    _withdrawalStatsCache = { result, expiresAt: now + WALLET_STATS_CACHE_TTL_MS };
    res.json(result);
  } catch (e: unknown) {
    res.status(500).json({ ok: false, message: errMsg(e) || "Erro ao buscar saques." });
  }
}

export async function getPublicEntries(_req: Request, res: Response): Promise<void> {
  try {
    const [entries, trackedWallet, publicWallets] = await Promise.all([
      prisma.transparencyEntry.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
      }),
      prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } }),
      prisma.transparencyTrackedWallet.findMany({
        where: { isActive: true, isPublic: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      })
    ]);
    res.json({
      ok: true,
      entries,
      trackedWallet: trackedWallet?.address || publicWallets[0]?.address || null,
      trackedWallets: publicWallets
    });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar dados." });
  }
}

export async function adminList(_req: Request, res: Response): Promise<void> {
  try {
    const entries = await prisma.transparencyEntry.findMany({
      orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
    res.json({ ok: true, entries });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar entradas." });
  }
}

export async function adminCreate(req: Request, res: Response): Promise<void> {
  try {
    const data = normalizeEntryPayload(asBodyRecord(req));
    const entry = await prisma.transparencyEntry.create({
      data: data as Prisma.TransparencyEntryCreateInput
    });
    res.json({ ok: true, entry });
  } catch (error: unknown) {
    const isValidationError = !isPrismaRuntimeError(error);
    res
      .status(isValidationError ? 400 : 500)
      .json({ ok: false, message: errMsg(error) || "Erro ao criar entrada." });
  }
}

type IdParams = { id: string };

export async function adminUpdate(req: Request<IdParams>, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  try {
    prevalidateEntryPatch(req.body);
    const current = await prisma.transparencyEntry.findUnique({ where: { id } });
    if (!current) {
      res.status(404).json({ ok: false, message: "Entrada não encontrada." });
      return;
    }
    const data = normalizeEntryPayload(asBodyRecord(req), current);
    const entry = await prisma.transparencyEntry.update({
      where: { id },
      data: data as Prisma.TransparencyEntryUpdateInput
    });
    res.json({ ok: true, entry });
  } catch (error: unknown) {
    const isValidationError = !isPrismaRuntimeError(error);
    res
      .status(isValidationError ? 400 : 500)
      .json({ ok: false, message: errMsg(error) || "Erro ao atualizar." });
  }
}

export async function adminDelete(req: Request<IdParams>, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await prisma.transparencyEntry.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao deletar." });
  }
}

export async function adminWalletGetSettings(_req: Request, res: Response): Promise<void> {
  try {
    const row = await prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
    res.json({ ok: true, address: row?.address || null });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao carregar carteira." });
  }
}

export async function adminWalletPutSettings(req: Request, res: Response): Promise<void> {
  const body = asBodyRecord(req);
  try {
    if (!Object.prototype.hasOwnProperty.call(body, "address")) {
      res.status(400).json({ ok: false, message: "Body deve incluir address (string vazia para limpar)." });
      return;
    }
    const trimmed = String(body.address).trim();
    const stored = trimmed ? assertValidTransparencyWalletAddress(trimmed) : null;
    await prisma.transparencyWalletSettings.upsert({
      where: { id: 1 },
      create: { id: 1, address: stored },
      update: { address: stored }
    });
    res.json({ ok: true, address: stored });
  } catch (e: unknown) {
    if (errCode(e) === "INVALID_ADDRESS") {
      res.status(400).json({ ok: false, message: errMsg(e) });
      return;
    }
    res.status(500).json({ ok: false, message: "Erro ao guardar carteira." });
  }
}

export async function adminTrackedWalletList(_req: Request, res: Response): Promise<void> {
  try {
    const wallets = await getTrackedWallets(true);
    res.json({ ok: true, wallets });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao listar carteiras rastreadas." });
  }
}

export async function adminTrackedWalletCreate(req: Request, res: Response): Promise<void> {
  try {
    const data = normalizeTrackedWalletPayload(asBodyRecord(req));
    const wallet = await prisma.transparencyTrackedWallet.create({ data });
    res.status(201).json({ ok: true, wallet });
  } catch (error: unknown) {
    res.status(400).json({ ok: false, message: errMsg(error) || "Erro ao criar carteira rastreada." });
  }
}

export async function adminTrackedWalletUpdate(req: Request<IdParams>, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await prisma.transparencyTrackedWallet.findUnique({ where: { id } });
    if (!current) {
      res.status(404).json({ ok: false, message: "Carteira não encontrada." });
      return;
    }
    const data = normalizeTrackedWalletPayload(asBodyRecord(req), current);
    const wallet = await prisma.transparencyTrackedWallet.update({ where: { id }, data });
    res.json({ ok: true, wallet });
  } catch (error: unknown) {
    res.status(400).json({ ok: false, message: errMsg(error) || "Erro ao atualizar carteira rastreada." });
  }
}

export async function adminTrackedWalletDelete(req: Request<IdParams>, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await prisma.transparencyTrackedWallet.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover carteira rastreada." });
  }
}

export async function adminWalletGetActivity(req: Request, res: Response): Promise<void> {
  try {
    const row = await prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
    if (!row?.address) {
      res.status(400).json({ ok: false, message: "Defina primeiro a carteira nas definições." });
      return;
    }
    const pageSize = Math.min(100, Math.max(25, parseInt(String(req.query?.pageSize || "100"), 10) || 100));
    const maxPages = Math.min(100, Math.max(1, parseInt(String(req.query?.maxPages || "100"), 10) || 100));
    const data = await fetchWalletNativeActivity(row.address, { pageSize, maxPages });
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    if (errCode(e) === "INVALID_ADDRESS") {
      res.status(400).json({ ok: false, message: errMsg(e) });
      return;
    }
    res.status(502).json({ ok: false, message: errMsg(e) || "Erro ao consultar a chain." });
  }
}

let _walletsLiveCache: { result: unknown; expiresAt: number } | null = null;
/** Per-wallet last-good values — merged into partial results so no card ever shows null if we've seen a value before. */
const _walletLastGoodMap = new Map<string, { valuePol: number | null; valueUsd: number | null; tokens?: unknown; nfts?: unknown }>();
let _walletsLiveFetching = false;

type WalletEntry = {
  id?: number | null;
  address: string;
  valuePol: number | null;
  valueUsd: number | null;
  tokens?: unknown;
  nfts?: unknown;
  [key: string]: unknown;
};

function mergeWithLastGood(wallets: WalletEntry[]): WalletEntry[] {
  return wallets.map((w) => {
    if (w.valuePol != null) {
      _walletLastGoodMap.set(w.address.toLowerCase(), {
        valuePol: w.valuePol,
        valueUsd: w.valueUsd,
        tokens:   w.tokens,
        nfts:     w.nfts,
      });
      return w;
    }
    const saved = _walletLastGoodMap.get(w.address.toLowerCase());
    if (saved) {
      return {
        ...w,
        valuePol: saved.valuePol,
        valueUsd: saved.valueUsd,
        ...(saved.tokens !== undefined ? { tokens: saved.tokens } : {}),
        ...(saved.nfts   !== undefined ? { nfts:   saved.nfts   } : {}),
      };
    }
    return w;
  });
}

async function _refreshWalletsLive(): Promise<void> {
  if (_walletsLiveFetching) return;
  _walletsLiveFetching = true;
  try {
    const wallets = await prisma.transparencyTrackedWallet.findMany({
      where: { isPublic: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (!wallets.length) return;
    const data = await fetchTrackedWalletsLive(wallets);
    const merged = mergeWithLastGood(data.wallets as WalletEntry[]);
    const someNull = merged.some((w: WalletEntry) => w.valuePol == null);
    const ttl = someNull ? 5 * 60 * 1000 : WALLETS_LIVE_CACHE_TTL_MS;
    const result = { ok: true, ...data, wallets: merged };
    _walletsLiveCache = { result, expiresAt: Date.now() + ttl };
    if (someNull) setTimeout(() => { void _refreshWalletsLive(); }, ttl + 30_000);
  } catch {
    /* keep serving the old cache */
  } finally {
    _walletsLiveFetching = false;
  }
}

// In-memory cache is now just a fast path on top of the DB snapshot written
// by walletSnapshotCron. No background polling from the controller — the cron
// owns the update schedule. We keep a passive 60-min interval only as a last-
// resort fallback for wallets that are NOT picked up by the new cron (legacy).
setInterval(() => { void _refreshWalletsLive(); }, WALLETS_LIVE_CACHE_TTL_MS);

/**
 * Build a wallets-live response from DB snapshots.
 * Returns null if no snapshots exist yet (cache still warming).
 */
async function buildResponseFromDb(): Promise<unknown | null> {
  const wallets = await prisma.transparencyTrackedWallet.findMany({
    where: { isPublic: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { snapshot: true },
  });

  if (!wallets.length) return { ok: true, polUsdPrice: null, wallets: [] };

  // If any wallet has no snapshot yet, treat as warming
  const anyMissing = wallets.some(w => !w.snapshot);
  if (anyMissing) return null;

  const MAX_SNAPSHOT_AGE_MS = 90 * 60 * 1000; // 90 min — cron runs every 30 min
  const tooOld = wallets.some(w => w.snapshot && Date.now() - w.snapshot.fetchedAt.getTime() > MAX_SNAPSHOT_AGE_MS);
  if (tooOld) return null;

  const mapped = wallets.map(w => {
    const snap = w.snapshot!;
    return {
      id:             w.id,
      label:          w.label,
      address:        w.address,
      chain:          w.chain,
      assetSymbol:    w.assetSymbol,
      explorerBaseUrl: w.explorerBaseUrl ?? "https://polygonscan.com/address",
      isActive:       w.isActive,
      displayMode:    w.displayMode,
      valuePol:       snap.valuePol,
      valueUsd:       snap.totalUsd,
      tokens:         snap.tokens,
      nfts:           snap.nfts,
      chains:         snap.chains,   // multi-chain breakdown
      fetchedAt:      snap.fetchedAt,
    };
  });

  return { ok: true, polUsdPrice: null, wallets: mapped };
}

export async function getPublicTrackedWalletsLive(_req: Request, res: Response): Promise<void> {
  const now = Date.now();

  // Fast path: in-memory cache (5 min TTL on top of DB reads)
  if (_walletsLiveCache && _walletsLiveCache.expiresAt > now) {
    res.json(_walletsLiveCache.result);
    return;
  }

  try {
    const dbResult = await buildResponseFromDb();
    if (dbResult) {
      // Populate in-memory cache for 5 min to avoid repeated DB reads
      _walletsLiveCache = { result: dbResult, expiresAt: now + 5 * 60 * 1000 };
      res.json(dbResult);
      return;
    }
  } catch (err) {
    console.warn("[wallets-live] DB read failed, falling back:", (err as Error)?.message);
  }

  // No DB data yet — kick off background refresh and tell frontend to retry
  void _refreshWalletsLive();
  res.json({ ok: true, warming: true, apiKeyConfigured: false, polUsdPrice: null, wallets: [] });
}

export async function adminTrackedWalletActivity(_req: Request, res: Response): Promise<void> {
  try {
    const wallets = await getTrackedWallets(false);
    if (!wallets.length) {
      res.json({
        ok: true,
        apiKeyConfigured: false,
        summary: {
          totalInPol: 0,
          totalOutPol: 0,
          totalInUsd: null,
          totalOutUsd: null,
          movementCount: 0,
          walletCount: 0
        },
        wallets: []
      });
      return;
    }
    const data = await fetchTrackedWalletsSummary(wallets, { pageSize: 100, maxPages: 100, previewLimit: 10 });
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    res.status(502).json({ ok: false, message: errMsg(e) || "Erro ao consultar carteiras rastreadas." });
  }
}
