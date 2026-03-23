import prisma from "../src/db/prisma.js";
import { authenticator } from "otplib";
import qrcode from "qrcode";

export const changeUsername = async (req, res) => {
  try {
    const { username } = req.body;
    const userId = req.user.id;

    if (!username || username.trim().length < 3) {
      return res.status(400).json({ ok: false, message: "Nome de usuário inválido." });
    }

    const existing = await prisma.user.findFirst({
      where: { username: username.trim(), id: { not: userId } }
    });

    if (existing) {
      return res.status(409).json({ ok: false, message: "Nome de usuário já está em uso." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { username: username.trim(), name: username.trim() }
    });

    res.json({ ok: true, message: "Nome de usuário alterado com sucesso." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao alterar o nome de usuário." });
  }
};

export const generate2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (user.isTwoFactorEnabled) {
      return res.status(400).json({ ok: false, message: "2FA já está ativado." });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, "BlockMiner", secret);
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret }
    });

    res.json({ ok: true, qrCodeUrl, secret });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao gerar 2FA." });
  }
};

export const enable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (user.isTwoFactorEnabled) {
      return res.status(400).json({ ok: false, message: "2FA já está ativado." });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({ ok: false, message: "Gere o 2FA primeiro." });
    }

    const isValid = authenticator.check(token, user.twoFactorSecret);

    if (!isValid) {
      return res.status(400).json({ ok: false, message: "Código inválido." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true }
    });

    res.json({ ok: true, message: "2FA ativado com sucesso." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao ativar 2FA." });
  }
};

export const disable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user.isTwoFactorEnabled) {
      return res.status(400).json({ ok: false, message: "2FA não está ativado." });
    }

    const isValid = authenticator.check(token, user.twoFactorSecret);

    if (!isValid) {
      return res.status(400).json({ ok: false, message: "Código inválido." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: false, twoFactorSecret: null }
    });

    res.json({ ok: true, message: "2FA desativado com sucesso." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao desativar 2FA." });
  }
};

export const get2FAStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    res.json({ ok: true, isTwoFactorEnabled: user.isTwoFactorEnabled });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao obter status." });
  }
};

export const reportAdblock = async (req, res) => {
  try {
    const userId = req.user.id;
    const { detected } = req.body;

    // Use metadata or a specific field to log adblock detection
    // For now, let's log it to the console and update a system log or user metadata if we had it.
    // To make it persistent in DB, we could use an AuditLog or a new column.
    // Let's assume we want to track it in User model if the field existed, 
    // but since we shouldn't change schema without prisma migrate, we'll use AuditLog.
    
    await prisma.auditLog.create({
      data: {
        userId,
        action: "adblock_detected",
        details: { detected, ip: req.ip, userAgent: req.headers['user-agent'] }
      }
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
};

export const getReferrals = async (req, res) => {
  try {
    const userId = req.user.id;
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referred: {
          select: {
            id: true,
            username: true,
            name: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ ok: true, referrals });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao obter referidos." });
  }
};