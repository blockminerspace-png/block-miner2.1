import prisma from "../src/db/prisma.js";

const VALID_CATEGORIES = ["infrastructure", "tooling", "marketing", "payroll", "legal", "misc"];
const VALID_INCOME_CATEGORIES = ["sponsorship", "donation", "revenue", "investment_return", "other"];
const VALID_PERIODS = ["daily", "monthly", "annual", "one_time"];
const VALID_TYPES = ["expense", "income"];

// Público: listar entradas ativas
export async function getPublicEntries(_req, res) {
  try {
    const entries = await prisma.transparencyEntry.findMany({
      where: { isActive: true },
      orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ ok: true, entries });
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
  const { type, category, incomeCategory, name, description, provider, providerUrl, imageUrl, amountUsd, period, isPaid, isActive, notes, sortOrder } = req.body;

  if (!name?.trim()) return res.status(400).json({ ok: false, message: "Nome é obrigatório." });
  if (!amountUsd || isNaN(parseFloat(amountUsd))) return res.status(400).json({ ok: false, message: "Valor inválido." });
  if (type && !VALID_TYPES.includes(type)) return res.status(400).json({ ok: false, message: "Tipo inválido." });
  if (!VALID_PERIODS.includes(period)) return res.status(400).json({ ok: false, message: "Período inválido." });

  const entryType = type || "expense";
  if (entryType === "expense" && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ ok: false, message: "Categoria inválida." });
  if (entryType === "income" && incomeCategory && !VALID_INCOME_CATEGORIES.includes(incomeCategory)) return res.status(400).json({ ok: false, message: "Categoria de receita inválida." });

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

  const { type, category, incomeCategory, name, description, provider, providerUrl, imageUrl, amountUsd, period, isPaid, isActive, notes, sortOrder } = req.body;

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


// Público: listar entradas ativas
export async function getPublicEntries(_req, res) {
  try {
    const entries = await prisma.transparencyEntry.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ ok: true, entries });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar dados." });
  }
}

// Admin: listar todas (ativas e inativas)
export async function adminList(_req, res) {
  try {
    const entries = await prisma.transparencyEntry.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    res.json({ ok: true, entries });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar entradas." });
  }
}

// Admin: criar
export async function adminCreate(req, res) {
  const { category, name, description, provider, providerUrl, amountUsd, period, isPaid, isActive, notes, sortOrder } = req.body;

  if (!name?.trim()) return res.status(400).json({ ok: false, message: "Nome é obrigatório." });
  if (!amountUsd || isNaN(parseFloat(amountUsd))) return res.status(400).json({ ok: false, message: "Valor inválido." });
  if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ ok: false, message: "Categoria inválida." });
  if (!VALID_PERIODS.includes(period)) return res.status(400).json({ ok: false, message: "Período inválido." });

  try {
    const entry = await prisma.transparencyEntry.create({
      data: {
        category,
        name: name.trim(),
        description: description?.trim() || null,
        provider: provider?.trim() || null,
        providerUrl: providerUrl?.trim() || null,
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

  const { category, name, description, provider, providerUrl, amountUsd, period, isPaid, isActive, notes, sortOrder } = req.body;

  if (category && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ ok: false, message: "Categoria inválida." });
  if (period && !VALID_PERIODS.includes(period)) return res.status(400).json({ ok: false, message: "Período inválido." });

  try {
    const entry = await prisma.transparencyEntry.update({
      where: { id },
      data: {
        ...(category && { category }),
        ...(name && { name: name.trim() }),
        description: description?.trim() ?? undefined,
        provider: provider?.trim() ?? undefined,
        providerUrl: providerUrl?.trim() ?? undefined,
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
