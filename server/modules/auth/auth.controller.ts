import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { isAdminKeyedPasswordResetApiEnabled } from "../../utils/adminPasswordResetPolicy.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../../utils/mailer.js";
import {
  unknownErrorMessage,
  timingSafeAdminSecretEqual,
} from "./shared/auth.security.js";
import { signPasswordResetToken, verifyPasswordResetToken } from "./shared/auth.password-jwt.js";
import { APP_URL, PASSWORD_RESET_TOKEN_TTL } from "./shared/auth.constants.js";
import { comparePassword, hashPassword } from "./shared/auth.service.js";
import { findUserByIdentifier, normalizeEmail } from "./shared/auth.repository.js";

const logger = loggerLib.child("AuthController");

export async function legacyPasswordResetPost(req: Request, res: Response): Promise<void> {
  try {
    const { resetToken, newPassword } = req.body as { resetToken?: unknown; newPassword?: unknown };
    if (!resetToken || !newPassword || String(newPassword).length < 8) {
      res.status(400).json({ ok: false, message: "Dados inválidos." });
      return;
    }

    const payload = verifyPasswordResetToken(resetToken);
    if (!payload?.sub) {
      res.status(401).json({ ok: false, message: "Token de reset inválido ou expirado." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user) {
      res.status(404).json({ ok: false, message: "Usuário não encontrado." });
      return;
    }

    const newPasswordHash = await hashPassword(String(newPassword), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    logger.info(`[SECURITY_AUDIT] Legacy password reset completed`, {
      userId: user.id,
      ip: req.headers["x-real-ip"] || req.ip,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true, message: "Sua senha foi atualizada com sucesso. Agora você já pode logar!" });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao resetar senha de migração." });
  }
}

export async function resetPasswordManualPost(req: Request, res: Response): Promise<void> {
  try {
    if (!isAdminKeyedPasswordResetApiEnabled()) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    const { email, newPassword, adminKey } = req.body as {
      email?: unknown;
      newPassword?: unknown;
      adminKey?: unknown;
    };

    if (!timingSafeAdminSecretEqual(adminKey, process.env.ADMIN_SECURITY_CODE)) {
      res.status(403).json({ ok: false, message: "Unauthorized manual reset." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: String(email ?? "") } });
    if (!user) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }

    const newPasswordHash = await hashPassword(String(newPassword ?? ""), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    logger.info(`Manual password reset for ${String(email ?? "")}`);
    res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch {
    res.status(500).json({ ok: false, message: "Erro no reset manual." });
  }
}

export async function forgotPasswordPost(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body as { email?: unknown };
    if (!email || String(email).trim().length === 0) {
      res.status(400).json({ ok: false, message: "Email é obrigatório." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await findUserByIdentifier(normalizedEmail);

    if (!user) {
      res.json({ ok: true, message: "Se o email existe, você receberá instruções de redefinição." });
      return;
    }

    if (!isSmtpConfigured()) {
      logger.warn("[SECURITY] Password reset requested but SMTP is not configured; no email sent.", {
        normalizedEmail,
      });
      res.json({
        ok: true,
        message: "Se o email existe, você receberá instruções de redefinição.",
      });
      return;
    }

    const resetToken = signPasswordResetToken(user.id);
    const resetUrl = `${APP_URL.replace(/\/$/, "")}/forgot-password?token=${encodeURIComponent(resetToken)}`;

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      ttlMinutes: Number(String(PASSWORD_RESET_TOKEN_TTL).replace(/[^0-9]/g, "")) || 20,
    });

    logger.info(`[SECURITY] Password reset requested for email: ${normalizedEmail}`);
    res.json({ ok: true, message: "Enviamos um link de redefinição para o seu e-mail." });
  } catch (error: unknown) {
    logger.error("Forgot password error", { error: unknownErrorMessage(error) });
    res.status(500).json({ ok: false, message: "Erro ao processar redefinição de senha." });
  }
}

export async function adminForcePasswordResetPost(req: Request, res: Response): Promise<void> {
  try {
    if (!isAdminKeyedPasswordResetApiEnabled()) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    const { email, newPassword, adminKey } = req.body as {
      email?: unknown;
      newPassword?: unknown;
      adminKey?: unknown;
    };

    if (!timingSafeAdminSecretEqual(adminKey, process.env.ADMIN_SECURITY_CODE)) {
      res.status(403).json({ ok: false, message: "Chave de admin inválida." });
      return;
    }

    if (!newPassword || String(newPassword).length < 8) {
      res.status(400).json({ ok: false, message: "Nova senha inválida." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await findUserByIdentifier(normalizedEmail);

    if (!user) {
      res.status(404).json({ ok: false, message: "Usuário não encontrado." });
      return;
    }

    const newPasswordHash = await hashPassword(String(newPassword), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    logger.info(`[ADMIN] Force password reset completed for email: ${normalizedEmail}`);
    res.json({ ok: true, message: "Senha redefinida com sucesso." });
  } catch (error: unknown) {
    logger.error("Admin force reset error", { error: unknownErrorMessage(error) });
    res.status(500).json({ ok: false, message: "Erro ao forçar redefinição de senha." });
  }
}

export async function changePasswordPost(req: Request, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: unknown; newPassword?: unknown };
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

    if (!user || !(await comparePassword(String(currentPassword ?? ""), user.passwordHash))) {
      res.status(401).json({ ok: false, message: "Senha atual incorreta." });
      return;
    }

    const newPasswordHash = await hashPassword(String(newPassword ?? ""), 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao alterar senha." });
  }
}
