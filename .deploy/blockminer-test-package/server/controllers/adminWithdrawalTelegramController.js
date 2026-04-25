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

export async function getSettings(_req, res) {
  try {
    const settings = await getWithdrawalTelegramSettings();
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load Telegram settings." });
  }
}

export async function putSettings(req, res) {
  try {
    const settings = await updateWithdrawalTelegramSettings(req.body || {});
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.statusCode ? error.message : "Unable to save Telegram settings.",
    });
  }
}

export async function patchSettings(req, res) {
  return putSettings(req, res);
}

export async function testPrivateAlert(req, res) {
  try {
    const event = await createTelegramTestEvent(TELEGRAM_EVENT_TYPES.WITHDRAWAL_REQUESTED_PRIVATE_ALERT, req.body || {});
    void createAuditLogBestEffort({
      userId: req.user?.id || null,
      action: "ADMIN_TELEGRAM_TEST_PRIVATE_ALERT",
      label: "Admin queued Telegram private alert test",
      source: "admin",
      severity: "info",
      details: { eventId: event.id },
      relatedEntityType: "telegram_outbox_event",
      relatedEntityId: event.id,
    });
    res.json({ ok: true, event });
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.statusCode ? error.message : "Unable to queue Telegram private alert test.",
    });
  }
}

export async function testPublicProof(req, res) {
  try {
    const event = await createTelegramTestEvent(TELEGRAM_EVENT_TYPES.WITHDRAWAL_COMPLETED_PUBLIC_PROOF, req.body || {});
    void createAuditLogBestEffort({
      userId: req.user?.id || null,
      action: "ADMIN_TELEGRAM_TEST_PUBLIC_PROOF",
      label: "Admin queued Telegram public proof test",
      source: "admin",
      severity: "info",
      details: { eventId: event.id },
      relatedEntityType: "telegram_outbox_event",
      relatedEntityId: event.id,
    });
    res.json({ ok: true, event });
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.statusCode ? error.message : "Unable to queue Telegram public proof test.",
    });
  }
}

export async function listEvents(req, res) {
  try {
    const page = Number(req.query?.page || 1);
    const limit = Number(req.query?.limit || 25);
    const result = await listTelegramOutboxEvents({ page, limit });
    res.json({ ok: true, ...result, page, limit });
  } catch (_error) {
    res.status(500).json({ ok: false, message: "Unable to load Telegram events." });
  }
}

export async function retryEvent(req, res) {
  try {
    const event = await retryTelegramOutboxEvent(req.params?.id);
    void createAuditLogBestEffort({
      userId: req.user?.id || null,
      action: "ADMIN_TELEGRAM_EVENT_RETRY",
      label: "Admin retried Telegram outbox event",
      source: "admin",
      severity: "warning",
      details: { eventId: event.id },
      relatedEntityType: "telegram_outbox_event",
      relatedEntityId: event.id,
    });
    res.json({ ok: true, event });
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      ok: false,
      message: error?.statusCode ? error.message : "Unable to retry Telegram event.",
    });
  }
}

export async function getHealth(_req, res) {
  try {
    const health = await getTelegramWorkerHealth();
    res.json({ ok: true, health });
  } catch (_error) {
    res.status(500).json({ ok: false, message: "Unable to load Telegram worker health." });
  }
}
