import prisma from "../src/db/prisma.js";
import {
  assertValidTransparencyWalletAddress,
  fetchTrackedWalletsSummary,
  fetchWalletNativeActivity,
} from "../services/transparencyWalletService.js";

const VALID_CATEGORIES = ["infrastructure", "tooling", "marketing", "payroll", "legal", "misc"];
const VALID_INCOME_CATEGORIES = ["sponsorship", "donation", "revenue", "investment_return", "other"];
const VALID_PERIODS = ["daily", "monthly", "annual", "one_time"];
const VALID_TYPES = ["expense", "income"];
const VALID_CHAINS = ["polygon"];
const VALID_DIRECTIONS = ["in", "out"];

function normalizeString(value, max = 5000) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value == null) return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function normalizeDecimal(value, fieldName, { required = false, min = 0 } = {}) {
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

function normalizeDate(value) {
  const s = normalizeString(value, 64);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Data da entrada inválida.");
  return d;
}

function normalizeEntryPayload(body, current = null) {
  const type = normalizeString(body.type || current?.type || "expense", 20)?.toLowerCase();
  if (!VALID_TYPES.includes(type)) throw new Error("Tipo inválido.");

  const category = normalizeString(body.category ?? current?.category ?? "misc", 64)?.toLowerCase();
  const incomeCategory = normalizeString(body.incomeCategory ?? current?.incomeCategory ?? null, 64)?.toLowerCase();
  if (type === "expense" && !VALID_CATEGORIES.includes(category)) throw new Error("Categoria inválida.");
  if (type === "income" && incomeCategory && !VALID_INCOME_CATEGORIES.includes(incomeCategory)) {
    throw new Error("Categoria de receita inválida.");
  }

  const period = normalizeString(body.period ?? current?.period ?? "monthly", 20)?.toLowerCase();
  if (!VALID_PERIODS.includes(period)) throw new Error("Período inválido.");

  const name = normalizeString(body.name ?? current?.name, 180);
  if (!name) throw new Error("Nome é obrigatório.");

  const amountUsd = normalizeDecimal(body.amountUsd ?? current?.amountUsd, "Valor em USD", { required: true, min: 0 });
  const amountOriginal = normalizeDecimal(body.amountOriginal ?? current?.amountOriginal, "Valor original", { required: false, min: 0 });
  const fxRateUsd = normalizeDecimal(body.fxRateUsd ?? current?.fxRateUsd, "Taxa USD", { required: false, min: 0 });
  const currencyCode = normalizeString(body.currencyCode ?? current?.currencyCode ?? "USD", 16)?.toUpperCase();
  const direction = normalizeString(body.direction ?? current?.direction ?? null, 8)?.toLowerCase();
  if (direction && !VALID_DIRECTIONS.includes(direction)) throw new Error("Direção inválida.");

  const blockchain = normalizeString(body.blockchain ?? current?.blockchain ?? null, 32)?.toLowerCase();
  if (blockchain && !VALID_CHAINS.includes(blockchain)) throw new Error("Blockchain inválida.");

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

  return {
    type,
    category: type === "expense" ? category : "misc",
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
    sortOrder: Math.max(0, parseInt(String(body.sortOrder ?? current?.sortOrder ?? 0), 10) || 0),
  };
}

function normalizeTrackedWalletPayload(body, current = null) {
  const label = normalizeString(body.label ?? current?.label, 140);
  if (!label) throw new Error("Rótulo da carteira é obrigatório.");
  const address = assertValidTransparencyWalletAddress(body.address ?? current?.address);
  const chain = normalizeString(body.chain ?? current?.chain ?? "polygon", 32)?.toLowerCase();
  if (!VALID_CHAINS.includes(chain)) throw new Error("Chain inválida.");
  const explorerBaseUrl = normalizeString(body.explorerBaseUrl ?? current?.explorerBaseUrl ?? "https://polygonscan.com/address", 1000);
  if (explorerBaseUrl) new URL(explorerBaseUrl);

  return {
    label,
    address,
    chain,
    assetSymbol: normalizeString(body.assetSymbol ?? current?.assetSymbol ?? "POL", 16)?.toUpperCase() || "POL",
    explorerBaseUrl,
    isActive: normalizeBool(body.isActive ?? current?.isActive, true),
    isPublic: normalizeBool(body.isPublic ?? current?.isPublic, true),
    includeInTotals: normalizeBool(body.includeInTotals ?? current?.includeInTotals, true),
    sortOrder: Math.max(0, parseInt(String(body.sortOrder ?? current?.sortOrder ?? 0), 10) || 0),
  };
}

function prevalidateEntryPatch(body) {
  if (!body || typeof body !== "object") return;

  if (body.type != null) {
    const type = normalizeString(body.type, 20)?.toLowerCase();
    if (!VALID_TYPES.includes(type)) throw new Error("Tipo inválido.");
  }

  if (body.category != null) {
    const category = normalizeString(body.category, 64)?.toLowerCase();
    if (!VALID_CATEGORIES.includes(category)) throw new Error("Categoria inválida.");
  }

  if (body.incomeCategory != null) {
    const incomeCategory = normalizeString(body.incomeCategory, 64)?.toLowerCase();
    if (!VALID_INCOME_CATEGORIES.includes(incomeCategory)) {
      throw new Error("Categoria de receita inválida.");
    }
  }

  if (body.period != null) {
    const period = normalizeString(body.period, 20)?.toLowerCase();
    if (!VALID_PERIODS.includes(period)) throw new Error("Período inválido.");
  }
}

function isPrismaRuntimeError(error) {
  const message = String(error?.message || "");
  return Boolean(
    error?.code ||
      message.includes("Invalid `prisma.") ||
      message.includes("SASL:") ||
      message.includes("Can't reach database server") ||
      message.includes("Authentication failed against database server")
  );
}

async function getTrackedWallets(includeInactive = true) {
  return prisma.transparencyTrackedWallet.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

// Público: listar entradas ativas + carteiras públicas
export async function getPublicEntries(_req, res) {
  try {
    const [entries, trackedWallet, publicWallets] = await Promise.all([
      prisma.transparencyEntry.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } }),
      prisma.transparencyTrackedWallet.findMany({
        where: { isActive: true, isPublic: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    res.json({
      ok: true,
      entries,
      trackedWallet: trackedWallet?.address || publicWallets[0]?.address || null,
      trackedWallets: publicWallets,
    });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar dados." });
  }
}

export async function adminList(_req, res) {
  try {
    const entries = await prisma.transparencyEntry.findMany({
      orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ ok: true, entries });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar entradas." });
  }
}

export async function adminCreate(req, res) {
  try {
    const data = normalizeEntryPayload(req.body || {});
    const entry = await prisma.transparencyEntry.create({ data });
    res.json({ ok: true, entry });
  } catch (error) {
    const isValidationError = !isPrismaRuntimeError(error);
    res
      .status(isValidationError ? 400 : 500)
      .json({ ok: false, message: error?.message || "Erro ao criar entrada." });
  }
}

export async function adminUpdate(req, res) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

  try {
    prevalidateEntryPatch(req.body || {});
    const current = await prisma.transparencyEntry.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ ok: false, message: "Entrada não encontrada." });
    const data = normalizeEntryPayload(req.body || {}, current);
    const entry = await prisma.transparencyEntry.update({ where: { id }, data });
    res.json({ ok: true, entry });
  } catch (error) {
    const isValidationError = !isPrismaRuntimeError(error);
    res
      .status(isValidationError ? 400 : 500)
      .json({ ok: false, message: error?.message || "Erro ao atualizar." });
  }
}

export async function adminDelete(req, res) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
  try {
    await prisma.transparencyEntry.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao deletar." });
  }
}

export async function adminWalletGetSettings(_req, res) {
  try {
    const row = await prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
    res.json({ ok: true, address: row?.address || null });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao carregar carteira." });
  }
}

export async function adminWalletPutSettings(req, res) {
  const body = req.body || {};
  try {
    if (!Object.prototype.hasOwnProperty.call(body, "address")) {
      return res.status(400).json({ ok: false, message: "Body deve incluir address (string vazia para limpar)." });
    }
    const trimmed = String(body.address).trim();
    const stored = trimmed ? assertValidTransparencyWalletAddress(trimmed) : null;
    await prisma.transparencyWalletSettings.upsert({
      where: { id: 1 },
      create: { id: 1, address: stored },
      update: { address: stored },
    });
    res.json({ ok: true, address: stored });
  } catch (e) {
    if (e?.code === "INVALID_ADDRESS") {
      return res.status(400).json({ ok: false, message: e.message });
    }
    res.status(500).json({ ok: false, message: "Erro ao guardar carteira." });
  }
}

export async function adminTrackedWalletList(_req, res) {
  try {
    const wallets = await getTrackedWallets(true);
    res.json({ ok: true, wallets });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao listar carteiras rastreadas." });
  }
}

export async function adminTrackedWalletCreate(req, res) {
  try {
    const data = normalizeTrackedWalletPayload(req.body || {});
    const wallet = await prisma.transparencyTrackedWallet.create({ data });
    res.status(201).json({ ok: true, wallet });
  } catch (error) {
    res.status(400).json({ ok: false, message: error?.message || "Erro ao criar carteira rastreada." });
  }
}

export async function adminTrackedWalletUpdate(req, res) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
  try {
    const current = await prisma.transparencyTrackedWallet.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ ok: false, message: "Carteira não encontrada." });
    const data = normalizeTrackedWalletPayload(req.body || {}, current);
    const wallet = await prisma.transparencyTrackedWallet.update({ where: { id }, data });
    res.json({ ok: true, wallet });
  } catch (error) {
    res.status(400).json({ ok: false, message: error?.message || "Erro ao atualizar carteira rastreada." });
  }
}

export async function adminTrackedWalletDelete(req, res) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
  try {
    await prisma.transparencyTrackedWallet.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover carteira rastreada." });
  }
}

export async function adminWalletGetActivity(req, res) {
  try {
    const row = await prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
    if (!row?.address) {
      return res.status(400).json({ ok: false, message: "Defina primeiro a carteira nas definições." });
    }
    const pageSize = Math.min(100, Math.max(25, parseInt(String(req.query?.pageSize || "100"), 10) || 100));
    const maxPages = Math.min(100, Math.max(1, parseInt(String(req.query?.maxPages || "100"), 10) || 100));
    const data = await fetchWalletNativeActivity(row.address, { pageSize, maxPages });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e?.code === "INVALID_ADDRESS") {
      return res.status(400).json({ ok: false, message: e.message });
    }
    res.status(502).json({ ok: false, message: e?.message || "Erro ao consultar a chain." });
  }
}

export async function adminTrackedWalletActivity(_req, res) {
  try {
    const wallets = await getTrackedWallets(false);
    if (!wallets.length) {
      return res.json({
        ok: true,
        apiKeyConfigured: false,
        summary: { totalInPol: 0, totalOutPol: 0, totalInUsd: null, totalOutUsd: null, movementCount: 0, walletCount: 0 },
        wallets: [],
      });
    }
    const data = await fetchTrackedWalletsSummary(wallets, { pageSize: 100, maxPages: 100, previewLimit: 10 });
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(502).json({ ok: false, message: e?.message || "Erro ao consultar carteiras rastreadas." });
  }
}
