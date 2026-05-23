import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import type { Prisma, User } from "@prisma/client";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { issueEmailTwoFactorChallenge, verifyEmailTwoFactorChallenge } from "../services/emailTwoFactorService.js";
import { isSmtpConfigured } from "../utils/mailer.js";

function clientIp(req: Request): string | undefined {
  const xReal = req.headers["x-real-ip"];
  const xff = req.headers["x-forwarded-for"];
  const fromXReal = typeof xReal === "string" ? xReal : Array.isArray(xReal) ? xReal[0] : undefined;
  const fromXff =
    typeof xff === "string" ? xff.split(",")[0]?.trim() : Array.isArray(xff) ? xff[0] : undefined;
  return fromXReal || fromXff || req.ip;
}

/** Prisma schema in repo may omit 2FA columns; they exist in some deployments — keep JS behavior. */
type User2FAFields = {
  isTwoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
};

function user2fa<T extends { id: number }>(user: T): T & User2FAFields {
  return user as T & User2FAFields;
}

function user2faUpdate(data: User2FAFields): Prisma.UserUpdateInput {
  return data as unknown as Prisma.UserUpdateInput;
}

export const changeUsername = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { username } = req.body as { username?: unknown };
    const userId = req.user.id;

    if (!username || typeof username !== "string" || username.trim().length < 3) {
      res.status(400).json({ ok: false, message: "Nome de usuário inválido." });
      return;
    }

    const existing = await prisma.user.findFirst({
      where: { username: username.trim(), id: { not: userId } }
    });

    if (existing) {
      res.status(409).json({ ok: false, message: "Nome de usuário já está em uso." });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { username: username.trim(), name: username.trim() }
    });

    res.json({ ok: true, message: "Nome de usuário alterado com sucesso." });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao alterar o nome de usuário." });
  }
};

export const generate2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const userRaw = await prisma.user.findUnique({ where: { id: userId } });

    if (!userRaw) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }
    const user = user2fa(userRaw);

    if (user.isTwoFactorEnabled) {
      res.status(400).json({ ok: false, message: "2FA já está ativado." });
      return;
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, "BlockMiner", secret);
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    await prisma.user.update({
      where: { id: userId },
      data: user2faUpdate({ twoFactorSecret: secret })
    });

    res.json({ ok: true, qrCodeUrl, secret });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao gerar 2FA." });
  }
};

export const enable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { token } = req.body as { token?: unknown };
    const userId = req.user.id;
    const userRaw = await prisma.user.findUnique({ where: { id: userId } });

    if (!userRaw) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }
    const user = user2fa(userRaw);

    if (user.isTwoFactorEnabled) {
      res.status(400).json({ ok: false, message: "2FA já está ativado." });
      return;
    }

    if (!user.twoFactorSecret) {
      res.status(400).json({ ok: false, message: "Gere o 2FA primeiro." });
      return;
    }

    if (typeof token !== "string") {
      res.status(400).json({ ok: false, message: "Código inválido." });
      return;
    }

    const isValid = authenticator.check(token, user.twoFactorSecret);

    if (!isValid) {
      res.status(400).json({ ok: false, message: "Código inválido." });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: user2faUpdate({ isTwoFactorEnabled: true })
    });

    res.json({ ok: true, message: "2FA ativado com sucesso." });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao ativar 2FA." });
  }
};

export const disable2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { token } = req.body as { token?: unknown };
    const userId = req.user.id;
    const userRaw = await prisma.user.findUnique({ where: { id: userId } });

    if (!userRaw) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }
    const user = user2fa(userRaw);

    if (!user.isTwoFactorEnabled) {
      res.status(400).json({ ok: false, message: "2FA não está ativado." });
      return;
    }

    if (typeof token !== "string" || !user.twoFactorSecret) {
      res.status(400).json({ ok: false, message: "Código inválido." });
      return;
    }

    const isValid = authenticator.check(token, user.twoFactorSecret);

    if (!isValid) {
      res.status(400).json({ ok: false, message: "Código inválido." });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: user2faUpdate({ isTwoFactorEnabled: false, twoFactorSecret: null })
    });

    res.json({ ok: true, message: "2FA desativado com sucesso." });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao desativar 2FA." });
  }
};

export const get2FAStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const userRaw = await prisma.user.findUnique({ where: { id: userId } });
    if (!userRaw) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }
    const user = user2fa(userRaw);
    res.json({ ok: true, isTwoFactorEnabled: Boolean(user.isTwoFactorEnabled) });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao obter status." });
  }
};

type AdblockBody = { detected?: unknown };

export const reportAdblock = async (req: Request<object, unknown, AdblockBody>, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const { detected } = req.body;

    await prisma.auditLog.create({
      data: {
        userId,
        action: "adblock_detected",
        metadata: {
          detected:
            typeof detected === "boolean"
              ? detected
              : detected != null && (typeof detected === "string" || typeof detected === "number")
                ? String(detected)
                : null,
          ip: req.ip ?? null,
          userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null
        }
      }
    });

    res.json({ ok: true });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false });
  }
};

export const getReferrals = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
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
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao obter referidos." });
  }
};

export const linkReferral = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const { refCode } = req.body as { refCode?: unknown };

    if (!refCode || typeof refCode !== "string" || !refCode.trim()) {
      res.status(400).json({ ok: false, message: "Código de indicação inválido." });
      return;
    }

    const existing = await prisma.referral.findUnique({ where: { referredId: userId } });
    if (existing) {
      res.status(409).json({ ok: false, message: "Você já possui um indicador vinculado." });
      return;
    }

    const raw = refCode.trim();
    let referrer: User | null = null;
    if (/^\d+$/.test(raw)) {
      referrer = await prisma.user.findUnique({ where: { id: Number(raw) } });
    }
    if (!referrer) {
      referrer = await prisma.user.findUnique({ where: { refCode: raw } });
    }

    if (!referrer) {
      res.status(404).json({ ok: false, message: "Código de indicação não encontrado." });
      return;
    }

    if (referrer.id === userId) {
      res.status(400).json({ ok: false, message: "Você não pode se auto-indicar." });
      return;
    }

    const cip = clientIp(req);
    if (referrer.ip && cip && referrer.ip === cip) {
      res.status(400).json({
        ok: false,
        message: "Não é permitido vincular um indicador da mesma rede."
      });
      return;
    }

    await prisma.$transaction([
      prisma.referral.create({ data: { referrerId: referrer.id, referredId: userId } }),
      prisma.user.update({ where: { id: userId }, data: { referredBy: referrer.id } })
    ]);

    res.json({ ok: true, message: "Indicador vinculado com sucesso!" });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao vincular indicador." });
  }
};

export const getEmailTwoFactorStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { emailTwoFactorEnabled: true } });
    if (!user) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }
    res.json({ ok: true, enabled: user.emailTwoFactorEnabled });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao obter status." });
  }
};

export const requestEmailTwoFactorChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    if (!isSmtpConfigured()) {
      res.status(503).json({ ok: false, message: "Email verification unavailable." });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } });
    if (!user) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }
    const challenge = await issueEmailTwoFactorChallenge({ userId: req.user.id, email: user.email, name: user.name });
    if (!challenge.ok) {
      res.status(503).json({ ok: false, message: "Failed to send verification email." });
      return;
    }
    res.json({ ok: true, challengeToken: challenge.challengeToken, ttlMinutes: challenge.ttlMinutes });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao enviar código." });
  }
};

export const enableEmailTwoFactor = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { code, challengeToken } = req.body as { code?: unknown; challengeToken?: unknown };
    const result = verifyEmailTwoFactorChallenge({
      challengeToken: typeof challengeToken === "string" ? challengeToken : undefined,
      code: typeof code === "string" ? code : undefined,
      userId: req.user.id,
    });
    if (!result.ok) {
      const msg = result.reason === "EXPIRED" ? "Código expirado." : "Código inválido.";
      res.status(401).json({ ok: false, message: msg, reason: result.reason });
      return;
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { emailTwoFactorEnabled: true } });
    res.json({ ok: true, message: "Verificação em duas etapas ativada." });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao ativar 2FA." });
  }
};

export const disableEmailTwoFactor = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { code, challengeToken } = req.body as { code?: unknown; challengeToken?: unknown };
    const result = verifyEmailTwoFactorChallenge({
      challengeToken: typeof challengeToken === "string" ? challengeToken : undefined,
      code: typeof code === "string" ? code : undefined,
      userId: req.user.id,
    });
    if (!result.ok) {
      const msg = result.reason === "EXPIRED" ? "Código expirado." : "Código inválido.";
      res.status(401).json({ ok: false, message: msg, reason: result.reason });
      return;
    }
    await prisma.user.update({ where: { id: req.user.id }, data: { emailTwoFactorEnabled: false } });
    res.json({ ok: true, message: "Verificação em duas etapas desativada." });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao desativar 2FA." });
  }
};
