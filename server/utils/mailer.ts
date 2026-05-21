import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import loggerLib from "./logger.js";

const logger = loggerLib.child("Mailer");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "";

let transporter: Transporter | null = null;

export function isSmtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  return transporter;
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  ttlMinutes
}: {
  to: string;
  name?: string | null;
  resetUrl: string;
  ttlMinutes?: number;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const safeName = name || "Miner";
  const safeTtl = Number(ttlMinutes || 20);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Redefinição de Senha</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Recebemos uma solicitação para redefinir sua senha.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Redefinir senha agora</a>
      </p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">Este link expira em ${safeTtl} minutos.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Se você não solicitou, ignore este e-mail.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Redefinição de Senha",
    "",
    `Olá, ${safeName}.`,
    "Recebemos uma solicitação para redefinir sua senha.",
    "",
    `Abra este link: ${resetUrl}`,
    "",
    `Este link expira em ${safeTtl} minutos.`,
    "Se você não solicitou, ignore este e-mail."
  ].join("\n");

  await tx.sendMail({
    from: SMTP_FROM,
    to,
    subject: "BlockMiner - Redefinição de Senha",
    text,
    html
  });

  logger.info("Password reset email sent", { to });
}

export async function sendLoginTwoFactorCodeEmail({
  to,
  name,
  code,
  ttlMinutes
}: {
  to: string;
  name?: string | null;
  code: string | number;
  ttlMinutes?: number;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const safeName = name || "Miner";
  const safeCode = String(code || "").trim();
  const safeTtl = Number(ttlMinutes || 10);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#22c55e;">BlockMiner - Login verification code</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Hello, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Use the code below to complete your login:</p>
      <p style="margin:0 0 18px 0;font-size:28px;letter-spacing:4px;font-weight:700;color:#f8fafc;">${safeCode}</p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">This code expires in ${safeTtl} minutes.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">If this was not you, ignore this email and change your password.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Login verification code",
    "",
    `Hello, ${safeName}.`,
    "Use this code to complete your login:",
    safeCode,
    "",
    `This code expires in ${safeTtl} minutes.`,
    "If this was not you, ignore this email and change your password."
  ].join("\n");

  await tx.sendMail({
    from: SMTP_FROM,
    to,
    subject: "BlockMiner - Login verification code",
    text,
    html
  });

  logger.info("Login 2FA email sent", { to });
}

const APP_URL = (process.env.APP_URL || "https://blockminer.space").replace(/\/+$/, "");

/**
 * Post-registration welcome (async via BullMQ worker when Redis is enabled).
 */
export async function sendWelcomeEmail({ to, name }: { to: string; name?: string | null }): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const safeName = name || "Miner";
  const dashboardUrl = `${APP_URL}/`;

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Hello, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Your account is ready. Start mining and build your farm.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Open dashboard</a>
      </p>
      <p style="margin:0;color:#64748b;font-size:12px;">If you did not create this account, you can ignore this message.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner",
    "",
    `Hello, ${safeName}.`,
    "Your account is ready. Start mining and build your farm.",
    "",
    `Dashboard: ${dashboardUrl}`,
    "",
    "If you did not create this account, ignore this email."
  ].join("\n");

  await tx.sendMail({
    from: SMTP_FROM,
    to,
    subject: "Welcome to BlockMiner",
    text,
    html
  });

  logger.info("Welcome email sent", { to });
}

export async function sendAdminPasswordResetEmail({
  to,
  name,
  newPassword,
}: {
  to: string;
  name?: string | null;
  newPassword: string;
}): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const safeName = name || "Miner";

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#f59e0b;">BlockMiner - Nova Senha</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Olá, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Um administrador redefiniu sua senha. Use as credenciais abaixo para acessar sua conta:</p>
      <p style="margin:0 0 8px 0;color:#94a3b8;font-size:13px;">E-mail: <span style="color:#f8fafc;font-weight:700;">${to}</span></p>
      <p style="margin:0 0 20px 0;color:#94a3b8;font-size:13px;">Nova senha: <span style="display:inline-block;background:#1e293b;color:#fbbf24;font-weight:700;letter-spacing:2px;padding:6px 12px;border-radius:8px;font-size:18px;">${newPassword}</span></p>
      <p style="margin:0;color:#64748b;font-size:12px;">Por segurança, recomendamos que troque esta senha após o primeiro acesso.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Nova Senha",
    "",
    `Olá, ${safeName}.`,
    "Um administrador redefiniu sua senha. Use as credenciais abaixo:",
    "",
    `E-mail: ${to}`,
    `Nova senha: ${newPassword}`,
    "",
    "Por segurança, recomendamos que troque esta senha após o primeiro acesso."
  ].join("\n");

  await tx.sendMail({
    from: SMTP_FROM,
    to,
    subject: "BlockMiner - Nova Senha Definida pelo Suporte",
    text,
    html
  });

  logger.info("Admin password reset email sent", { to });
}
