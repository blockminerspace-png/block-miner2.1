import express from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import { getTrafficSummary, getTrafficByDomain, getTrafficByUtm, getTrafficDaily } from "./traffic.service.js";

export const adminTrafficRouter = express.Router();

adminTrafficRouter.use(requireAdminAuth);

adminTrafficRouter.get("/summary", async (req, res) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? "30"), 10) || 30, 365);
    res.json({ ok: true, ...(await getTrafficSummary(days)) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

adminTrafficRouter.get("/by-domain", async (req, res) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? "30"), 10) || 30, 365);
    res.json({ ok: true, rows: await getTrafficByDomain(days) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

adminTrafficRouter.get("/by-utm", async (req, res) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? "30"), 10) || 30, 365);
    res.json({ ok: true, rows: await getTrafficByUtm(days) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});

adminTrafficRouter.get("/daily", async (req, res) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? "30"), 10) || 30, 365);
    res.json({ ok: true, rows: await getTrafficDaily(days) });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
});
