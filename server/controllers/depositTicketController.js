import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("DepositTicketController");

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const DEPOSIT_WALLET = (process.env.DEPOSIT_WALLET_ADDRESS || process.env.CHECKIN_RECEIVER || "").toLowerCase();
const MAX_TICKETS_OPEN = 3;

// ─── USER: abrir ticket ──────────────────────────────────────────────────────

export async function createTicket(req, res) {
  try {
    const userId = req.user.id;
    const { walletAddress, txHash, amountClaimed, description } = req.body || {};

    if (!walletAddress || typeof walletAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return res.status(400).json({ ok: false, message: "Endereço de carteira inválido." });
    }

    // Limitar tickets abertos simultâneos
    const openCount = await prisma.depositTicket.count({
      where: { userId, status: { in: ["open", "analyzing"] } }
    });
    if (openCount >= MAX_TICKETS_OPEN) {
      return res.status(429).json({ ok: false, message: "Você já tem tickets abertos em análise. Aguarde a resolução." });
    }

    // Evitar duplicata de txHash
    if (txHash) {
      const dup = await prisma.depositTicket.findFirst({ where: { txHash: txHash.trim(), userId } });
      if (dup) {
        return res.status(409).json({ ok: false, message: "Já existe um ticket para esta transação." });
      }
    }

    const ticket = await prisma.depositTicket.create({
      data: {
        userId,
        walletAddress: walletAddress.trim().toLowerCase(),
        txHash: txHash ? txHash.trim() : null,
        amountClaimed: amountClaimed ? String(amountClaimed) : null,
        description: description ? String(description).slice(0, 1000) : null,
        status: "open"
      }
    });

    return res.json({ ok: true, ticket });
  } catch (error) {
    logger.error("createTicket error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Erro ao abrir ticket." });
  }
}

// ─── USER: listar meus tickets ───────────────────────────────────────────────

export async function listMyTickets(req, res) {
  try {
    const tickets = await prisma.depositTicket.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return res.json({ ok: true, tickets });
  } catch (error) {
    logger.error("listMyTickets error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Erro ao listar tickets." });
  }
}

// ─── ADMIN: listar todos tickets ─────────────────────────────────────────────

export async function adminListTickets(req, res) {
  try {
    const { status, page = 1 } = req.query;
    const take = 30;
    const skip = (Number(page) - 1) * take;

    const where = status && status !== "all" ? { status } : {};
    const [tickets, total] = await Promise.all([
      prisma.depositTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          user: { select: { id: true, username: true, email: true } }
        }
      }),
      prisma.depositTicket.count({ where })
    ]);

    return res.json({ ok: true, tickets, total, page: Number(page) });
  } catch (error) {
    logger.error("adminListTickets error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Erro ao listar tickets." });
  }
}

// ─── ADMIN: buscar ticket + analisar on-chain ─────────────────────────────────

export async function adminGetTicket(req, res) {
  try {
    const { id } = req.params;
    const ticket = await prisma.depositTicket.findUnique({
      where: { id: Number(id) },
      include: { user: { select: { id: true, username: true, email: true, walletAddress: true, polBalance: true } } }
    });
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket não encontrado." });

    // Análise on-chain automática
    let onchainData = ticket.onchainDataJson ? JSON.parse(ticket.onchainDataJson) : null;

    // Sempre re-analisa se estiver open/analyzing
    if (ticket.status === "open" || ticket.status === "analyzing") {
      onchainData = await analyzeOnChain(ticket);
      await prisma.depositTicket.update({
        where: { id: ticket.id },
        data: {
          status: "analyzing",
          onchainDataJson: JSON.stringify(onchainData)
        }
      });
    }

    return res.json({ ok: true, ticket: { ...ticket, onchainData } });
  } catch (error) {
    logger.error("adminGetTicket error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Erro ao buscar ticket." });
  }
}

// ─── ADMIN: aprovar (creditar depósito manualmente) ──────────────────────────

export async function adminApproveTicket(req, res) {
  try {
    const { id } = req.params;
    const { amount, note } = req.body || {};

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ ok: false, message: "Valor inválido para crédito." });
    }

    const ticket = await prisma.depositTicket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket não encontrado." });
    if (ticket.status === "approved" || ticket.status === "credited") {
      return res.status(409).json({ ok: false, message: "Ticket já resolvido." });
    }

    const creditAmount = Number(amount);

    await prisma.$transaction(async (tx) => {
      // Creditar saldo do usuário
      await tx.user.update({
        where: { id: ticket.userId },
        data: { polBalance: { increment: creditAmount } }
      });

      // Registrar transação de depósito
      await tx.transaction.create({
        data: {
          userId: ticket.userId,
          type: "deposit",
          amount: String(creditAmount),
          txHash: ticket.txHash || null,
          fromAddress: ticket.walletAddress,
          status: "completed",
          completedAt: new Date()
        }
      });

      // Atualizar ticket
      await tx.depositTicket.update({
        where: { id: ticket.id },
        data: {
          status: "credited",
          adminAction: "credit_applied",
          adminNote: note || null,
          creditedAmount: String(creditAmount),
          resolvedAt: new Date()
        }
      });

      // Notificar usuário
      await tx.notification.create({
        data: {
          userId: ticket.userId,
          title: "Depósito Creditado",
          message: `Seu ticket de depósito foi analisado e ${creditAmount.toFixed(4)} POL foram creditados na sua carteira.`,
          type: "success"
        }
      });
    });

    return res.json({ ok: true, message: "Depósito creditado com sucesso." });
  } catch (error) {
    logger.error("adminApproveTicket error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Erro ao aprovar ticket." });
  }
}

// ─── ADMIN: rejeitar ticket ───────────────────────────────────────────────────

export async function adminRejectTicket(req, res) {
  try {
    const { id } = req.params;
    const { note } = req.body || {};

    const ticket = await prisma.depositTicket.findUnique({ where: { id: Number(id) } });
    if (!ticket) return res.status(404).json({ ok: false, message: "Ticket não encontrado." });
    if (ticket.status === "approved" || ticket.status === "credited" || ticket.status === "rejected") {
      return res.status(409).json({ ok: false, message: "Ticket já resolvido." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.depositTicket.update({
        where: { id: ticket.id },
        data: {
          status: "rejected",
          adminAction: "none",
          adminNote: note || null,
          resolvedAt: new Date()
        }
      });

      await tx.notification.create({
        data: {
          userId: ticket.userId,
          title: "Ticket de Depósito Rejeitado",
          message: note
            ? `Seu ticket de depósito foi analisado e rejeitado. Motivo: ${note}`
            : "Seu ticket de depósito foi analisado e rejeitado. Não foi possível confirmar a transação.",
          type: "warning"
        }
      });
    });

    return res.json({ ok: true, message: "Ticket rejeitado." });
  } catch (error) {
    logger.error("adminRejectTicket error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Erro ao rejeitar ticket." });
  }
}

// ─── Análise on-chain via Etherscan V2 (chainid=137 = Polygon) ───────────────

const ETHERSCAN_V2 = (address, module, action, extra = "") =>
  `https://api.etherscan.io/v2/api?chainid=137&module=${module}&action=${action}&apikey=${POLYGONSCAN_API_KEY}${extra ? "&" + extra : ""}`;

async function analyzeOnChain(ticket) {
  const result = {
    found: false,
    txHash: ticket.txHash || null,
    from: null,
    to: null,
    value: null,
    valueEther: null,
    blockNumber: null,
    isSuccess: null,
    toIsOurWallet: false,
    fromMatchesTicket: false,
    alreadyCredited: false,
    recentTxsFromWallet: []
  };

  if (!POLYGONSCAN_API_KEY) {
    result.error = "POLYGONSCAN_API_KEY não configurada.";
    return result;
  }

  try {
    // 1. Verificar tx específica se fornecida
    if (ticket.txHash) {
      const [txRes, receiptRes] = await Promise.all([
        fetch(ETHERSCAN_V2(null, "proxy", "eth_getTransactionByHash", `txhash=${ticket.txHash}`)),
        fetch(ETHERSCAN_V2(null, "proxy", "eth_getTransactionReceipt", `txhash=${ticket.txHash}`))
      ]);
      const [txData, receiptData] = await Promise.all([txRes.json(), receiptRes.json()]);

      const tx = txData?.result;
      if (tx && tx.hash) {
        result.found = true;
        result.from = tx.from?.toLowerCase();
        result.to = tx.to?.toLowerCase();
        result.value = tx.value;
        result.valueEther = tx.value ? (parseInt(tx.value, 16) / 1e18).toFixed(8) : "0";
        result.blockNumber = tx.blockNumber ? parseInt(tx.blockNumber, 16) : null;
        result.toIsOurWallet = DEPOSIT_WALLET ? result.to === DEPOSIT_WALLET : false;
        result.fromMatchesTicket = result.from === ticket.walletAddress.toLowerCase();

        const receipt = receiptData?.result;
        if (receipt) {
          result.isSuccess = receipt.status === "0x1";
        }
      }

      // Verificar se txHash já foi creditado no sistema
      const existing = await prisma.transaction.findFirst({
        where: { txHash: ticket.txHash, type: "deposit", status: "completed" }
      });
      result.alreadyCredited = !!existing;
    }

    // 2. Buscar TODOS os depósitos enviados pela carteira do usuário para nossa wallet
    //    nos últimos 365 dias (~2.3M blocos no Polygon ≈ 1 bloco/2s)
    //    Usando address=CARTEIRA_USUARIO e filtrando to=DEPOSIT_WALLET no resultado
    if (ticket.walletAddress && DEPOSIT_WALLET) {
      const url = ETHERSCAN_V2(
        null,
        "account",
        "txlist",
        `address=${ticket.walletAddress}&startblock=0&endblock=99999999&sort=desc&page=1&offset=200`
      );
      const listRes = await fetch(url);
      const listData = await listRes.json();

      if (listData?.result && Array.isArray(listData.result)) {
        const cutoff = Date.now() / 1000 - 365 * 24 * 3600; // 365 dias atrás em unix
        const toUs = listData.result
          .filter(
            (tx) =>
              tx.to?.toLowerCase() === DEPOSIT_WALLET &&
              tx.isError === "0" &&
              Number(tx.timeStamp) >= cutoff
          )
          .slice(0, 20)
          .map((tx) => ({
            hash: tx.hash,
            value: (parseInt(tx.value) / 1e18).toFixed(8),
            timestamp: Number(tx.timeStamp),
            blockNumber: Number(tx.blockNumber)
          }));
        result.recentTxsFromWallet = toUs;
      } else if (listData?.message && listData.message !== "No transactions found") {
        result.walletScanError = listData.message;
      }
    }
  } catch (err) {
    result.error = err.message;
    logger.warn("analyzeOnChain error", { error: err.message });
  }

  return result;
}
