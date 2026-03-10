import crypto from "crypto";
import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("ZerAdsController");
const ZERADS_SITE_ID = process.env.ZERADS_SITE_ID || "10776";
const ZERADS_PTC_EXCHANGE_RATE = Number(process.env.ZERADS_PTC_EXCHANGE_RATE) || 0.0001;
const ZERADS_SECRET_KEY = process.env.ZERADS_SECRET_KEY || "change_me_in_env";

export async function getPtcLink(req, res) {
  try {
    const userId = req.user.id;
    const externalUser = `u${userId}_${crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 8)}`;
    const ptcUrl = `https://zerads.com/ptc.php?ref=${ZERADS_SITE_ID}&user=${externalUser}`;
    res.json({ ok: true, ptcUrl, externalUser });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error generating link." });
  }
}

export async function handlePtcCallback(req, res) {
  try {
    // A rede de anúncios pode enviar os dados via GET (query) ou POST (body)
    const payload = Object.keys(req.body).length > 0 ? req.body : req.query;
    const { user: externalUser, amount, clicks, secret } = payload;
    
    if (!externalUser || !amount) return res.status(400).send("missing_params");

    // ANTI-CHEAT: Valida se a requisição veio realmente do provedor de anúncios
    if (ZERADS_SECRET_KEY !== "change_me_in_env" && secret !== ZERADS_SECRET_KEY) {
      logger.warn(`ZerAds Callback Unauthorized: Invalid secret attempt for user ${externalUser}`);
      return res.status(403).send("unauthorized");
    }

    const userIdMatch = externalUser.match(/^u(\d+)_/);
    if (!userIdMatch) return res.status(400).send("invalid_user");
    
    const userId = parseInt(userIdMatch[1]);
    const amountNum = Number(amount);
    const payoutAmount = amountNum * ZERADS_PTC_EXCHANGE_RATE;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { usdcBalance: { increment: payoutAmount } }
      });
      
      await tx.auditLog.create({
        data: {
          userId,
          action: "zerads_ptc",
          details: { externalUser, amountZer: amountNum, payoutAmount, clicks }
        }
      });
    });

    res.send("ok");
  } catch (error) {
    logger.error("ZerAds callback error", { error: error.message });
    res.status(500).send("error");
  }
}

export async function getStats(req, res) {
  try {
    const userId = req.user.id;
    const logs = await prisma.auditLog.findMany({
      where: { userId, action: "zerads_ptc" },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    res.json({ ok: true, stats: { totalClicks: logs.length, recent: logs } });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error fetching stats." });
  }
}

export async function getOfferwallLink(req, res) {
  try {
    const userId = req.user.id;
    const externalUser = `u${userId}_${crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 8)}`;
    const offerwallUrl = `https://zerads.com/offerwall.php?ref=${ZERADS_SITE_ID}&user=${externalUser}`;
    res.json({ ok: true, offerwallUrl });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error generating offerwall link." });
  }
}
