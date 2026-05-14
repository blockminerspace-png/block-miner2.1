import type { Request, Response } from "express";
import {
  TELEGRAM_EVENT_TYPES,
  createTelegramTestEvent,
  getWithdrawalTelegramSettings,
  getTelegramWorkerHealth,
  listTelegramOutboxEvents,
  retryTelegramOutboxEvent,
  updateWithdrawalTelegramSettings,
} from "../services/withdrawalTelegramService.js";
import { createAuditLogBestEffort } from "../models/auditLogModel.js";

function readMessage(e: unknown): string | undefined {
  if (e instanceof Error) return e.message;
  if (e !== null && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

function toTelegramErrorReply(e: unknown, fallback: string): { status: number; message: string } {
  let status = 500;
  let message = fallback;
  if (typeof e === "object" && e !== null && "statusCode" in e) {
    const raw = (e as { statusCode?: unknown }).statusCode;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      status = raw || 500;
      if (raw)
        message = readMessage(e) ?? fallback;
    }
  }
  return { status, message };
}

type SettingsBody = Record<string, unknown>;

export async function getSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await getWithdrawalTelegramSettings();
    res.json({ ok: true, settings });
  } catch (_error: unknown) {
    res.status(500).json({ ok: false, message: "Unable to load Telegram settings." });
  }
}

export async function putSettings(req: Request<unknown, unknown, SettingsBody>, res: Response): Promise<void> {
  try {
    const settings = await updateWithdrawalTelegramSettings();
    res.json({ ok: true, settings });
  } catch (error: unknown) {
    const r = toTelegramErrorReply(error, "Unable to save Telegram settings.");
    res.status(r.status).json({ ok: false, message: r.message });
  }
}

export async function patchSettings(req: Request<unknown, unknown, SettingsBody>, res: Response): Promise<void> {
  return putSettings(req, res);
}

export async function testPrivateAlert(
  req: Request<unknown, unknown, Record<string, unknown>>,
  res: Response
): Promise<void> {
  try {
    const event = await createTelegramTestEvent(
      TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT,
      req.body ?? {}
    );
    void createAuditLogBestEffort({
      userId: req.user?.id ?? null,
      action: "ADMIN_TELEGRAM_TEST_PRIVATE_ALERT",
      label: "Admin queued Telegram private alert test",
      source: "admin",
      severity: "info",
      details: { eventId: event.id },
      relatedEntityType: "telegram_outbox_event",
      relatedEntityId: event.id,
    });
    res.json({ ok: true, event });
  } catch (error: unknown) {
    const r = toTelegramErrorReply(error, "Unable to queue Telegram private alert test.");
    res.status(r.status).json({ ok: false, message: r.message });
  }
}

export async function testPublicProof(
  req: Request<unknown, unknown, Record<string, unknown>>,
  res: Response
): Promise<void> {
  try {
    const event = await createTelegramTestEvent(
      TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF,
      req.body ?? {}
    );
    void createAuditLogBestEffort({
      userId: req.user?.id ?? null,
      action: "ADMIN_TELEGRAM_TEST_PUBLIC_PROOF",
      label: "Admin queued Telegram public proof test",
      source: "admin",
      severity: "info",
      details: { eventId: event.id },
      relatedEntityType: "telegram_outbox_event",
      relatedEntityId: event.id,
    });
    res.json({ ok: true, event });
  } catch (error: unknown) {
    const r = toTelegramErrorReply(error, "Unable to queue Telegram public proof test.");
    res.status(r.status).json({ ok: false, message: r.message });
  }
}

type EventsQuery = { page?: unknown; limit?: unknown };

export async function listEvents(
  req: Request<unknown, unknown, unknown, EventsQuery>,
  res: Response
): Promise<void> {
  try {
    const page = Number(req.query?.page ?? 1);
    const limit = Number(req.query?.limit ?? 25);
    const result = await listTelegramOutboxEvents({ page, limit });
    res.json({ ok: true, ...result, page, limit });
  } catch (_error: unknown) {
    res.status(500).json({ ok: false, message: "Unable to load Telegram events." });
  }
}

type RetryParams = { id: string };

export async function retryEvent(req: Request<RetryParams>, res: Response): Promise<void> {
  try {
    const event = await retryTelegramOutboxEvent(req.params?.id ?? "");
    void createAuditLogBestEffort({
      userId: req.user?.id ?? null,
      action: "ADMIN_TELEGRAM_EVENT_RETRY",
      label: "Admin retried Telegram outbox event",
      source: "admin",
      severity: "warning",
      details: { eventId: event.id },
      relatedEntityType: "telegram_outbox_event",
      relatedEntityId: event.id,
    });
    res.json({ ok: true, event });
  } catch (error: unknown) {
    const r = toTelegramErrorReply(error, "Unable to retry Telegram event.");
    res.status(r.status).json({ ok: false, message: r.message });
  }
}

export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    const health = await getTelegramWorkerHealth();
    res.json({ ok: true, health });
  } catch (_error: unknown) {
    res.status(500).json({ ok: false, message: "Unable to load Telegram worker health." });
  }
}
