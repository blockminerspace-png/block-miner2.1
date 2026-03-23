import nodemailer from "nodemailer";
import loggerLib from "./logger.js";

const logger = loggerLib.child("Mailer");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "";

let transporter = null;

export function isSmtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function getTransporter() {
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

export async function sendPasswordResetEmail({ to, name, resetUrl, ttlMinutes }) {
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const safeName = name || "Miner";
  const safeTtl = Number(ttlMinutes || 20);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Redefinicao de Senha</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Ola, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Recebemos uma solicitacao para redefinir sua senha.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Redefinir senha agora</a>
      </p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">Este link expira em ${safeTtl} minutos.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Se voce nao solicitou, ignore este e-mail.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Redefinicao de Senha",
    "",
    `Ola, ${safeName}.`,
    "Recebemos uma solicitacao para redefinir sua senha.",
    "",
    `Abra este link: ${resetUrl}`,
    "",
    `Este link expira em ${safeTtl} minutos.`,
    "Se voce nao solicitou, ignore este e-mail."
  ].join("\n");

  await tx.sendMail({
    from: SMTP_FROM,
    to,
    subject: "BlockMiner - Redefinicao de Senha",
    text,
    html
  });

  logger.info("Password reset email sent", { to });
}