import prisma from "../src/db/prisma.js";
import {
  assertValidTransparencyWalletAddress,
  fetchWalletNativeActivity,
} from "../services/transparencyWalletService.js";

const VALID_CATEGORIES = ["infrastructure", "tooling", "marketing", "payroll", "legal", "misc"];
const VALID_INCOME_CATEGORIES = ["sponsorship", "donation", "revenue", "investment_return", "other"];
const VALID_PERIODS = ["daily", "monthly", "annual", "one_time"];
const VALID_TYPES = ["expense", "income"];

// Público: listar entradas ativas
export async function getPublicEntries(_req, res) {
  try {
    const [entries, walletRow] = await Promise.all([
      prisma.transparencyEntry.findMany({
        where: { isActive: true },
        orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } }),
    ]);
    res.json({ ok: true, entries, trackedWallet: walletRow?.address || null });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar dados." });
  }
}

// Admin: listar todas (ativas e inativas)
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

// Admin: criar
export async function adminCreate(req, res) {
  const {
    type, category, incomeCategory, name, description,
    provider, providerUrl, imageUrl, amountUsd, period,
    isPaid, isActive, notes, sortOrder,
  } = req.body;

  if (!name?.trim()) return res.status(400).json({ ok: false, message: "Nome é obrigatório." });
  if (!amountUsd || isNaN(parseFloat(amountUsd))) return res.status(400).json({ ok: false, message: "Valor inválido." });
  if (type && !VALID_TYPES.includes(type)) return res.status(400).json({ ok: false, message: "Tipo inválido." });
  if (!VALID_PERIODS.includes(period)) return res.status(400).json({ ok: false, message: "Período inválido." });

  const entryType = type || "expense";
  if (entryType === "expense" && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ ok: false, message: "Categoria inválida." });
  }
  if (entryType === "income" && incomeCategory && !VALID_INCOME_CATEGORIES.includes(incomeCategory)) {
    return res.status(400).json({ ok: false, message: "Categoria de receita inválida." });
  }

  try {
    const entry = await prisma.transparencyEntry.create({
      data: {
        type: entryType,
        category: entryType === "expense" ? category : "misc",
        incomeCategory: entryType === "income" ? (incomeCategory || "other") : null,
        name: name.trim(),
        description: description?.trim() || null,
        provider: provider?.trim() || null,
        providerUrl: providerUrl?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        amountUsd: parseFloat(amountUsd),
        period,
        isPaid: isPaid !== false,
        isActive: isActive !== false,
        notes: notes?.trim() || null,
        sortOrder: parseInt(sortOrder) || 0,
      },
    });
    res.json({ ok: true, entry });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao criar entrada." });
  }
}

// Admin: atualizar
export async function adminUpdate(req, res) {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

  const {
    type, category, incomeCategory, name, description,
    provider, providerUrl, imageUrl, amountUsd, period,
    isPaid, isActive, notes, sortOrder,
  } = req.body;

  if (type && !VALID_TYPES.includes(type)) return res.status(400).json({ ok: false, message: "Tipo inválido." });
  if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ ok: false, message: "Categoria inválida." });
  if (incomeCategory && !VALID_INCOME_CATEGORIES.includes(incomeCategory)) return res.status(400).json({ ok: false, message: "Categoria de receita inválida." });
  if (period && !VALID_PERIODS.includes(period)) return res.status(400).json({ ok: false, message: "Período inválido." });

  try {
    const entry = await prisma.transparencyEntry.update({
      where: { id },
      data: {
        ...(type && { type }),
        ...(category && { category }),
        ...(incomeCategory !== undefined && { incomeCategory: incomeCategory || null }),
        ...(name && { name: name.trim() }),
        description: description?.trim() ?? undefined,
        provider: provider?.trim() ?? undefined,
        providerUrl: providerUrl?.trim() ?? undefined,
        imageUrl: imageUrl !== undefined ? (imageUrl?.trim() || null) : undefined,
        ...(amountUsd !== undefined && { amountUsd: parseFloat(amountUsd) }),
        ...(period && { period }),
        ...(isPaid !== undefined && { isPaid }),
        ...(isActive !== undefined && { isActive }),
        notes: notes?.trim() ?? undefined,
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) || 0 }),
      },
    });
    res.json({ ok: true, entry });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao atualizar." });
  }
}

// Admin: deletar
export async function adminDelete(req, res) {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
  try {
    await prisma.transparencyEntry.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao deletar." });
  }
}

/** GET /api/admin/transparency/wallet/settings */
export async function adminWalletGetSettings(_req, res) {
  try {
    const row = await prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
    res.json({ ok: true, address: row?.address || null });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao carregar carteira." });
  }
}

/** PUT /api/admin/transparency/wallet/settings — body: { address: string } (empty string clears) */
export async function adminWalletPutSettings(req, res) {
  const body = req.body || {};
  try {
    let stored = null;
    if (!Object.prototype.hasOwnProperty.call(body, "address")) {
      return res.status(400).json({ ok: false, message: "Body deve incluir address (string vazia para limpar)." });
    }
    const trimmed = String(body.address).trim();
    if (!trimmed) {
      stored = null;
    } else {
      stored = assertValidTransparencyWalletAddress(trimmed);
    }

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

/** GET /api/admin/transparency/wallet/activity?page=1&offset=50 */
export async function adminWalletGetActivity(req, res) {
  try {
    const row = await prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
    if (!row?.address) {
      return res.status(400).json({ ok: false, message: "Defina primeiro a carteira nas definições." });
    }
    const page = Math.min(10, Math.max(1, parseInt(String(req.query?.page || "1"), 10) || 1));
    const offset = Math.min(100, Math.max(10, parseInt(String(req.query?.offset || "50"), 10) || 50));
    const data = await fetchWalletNativeActivity(row.address, { page, offset });
    res.json({ ok: true, ...data });
  } catch (e) {
    if (e?.code === "INVALID_ADDRESS") {
      return res.status(400).json({ ok: false, message: e.message });
    }
    res.status(502).json({ ok: false, message: e?.message || "Erro ao consultar a chain." });
  }
}
