import {
  getWithdrawalTelegramSettings,
  updateWithdrawalTelegramSettings,
} from "../services/withdrawalTelegramService.js";

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
