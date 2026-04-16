/**
 * Dedicated Polygon HD deposit microservice (Docker service `phd`).
 * Owns address allocation when POLYGON_HD_MNEMONIC is injected only here.
 */
import "dotenv/config";
import express from "express";
import crypto from "crypto";
import cron from "node-cron";
import loggerLib from "./utils/logger.js";
import { allocatePolygonHdAddress } from "./services/polygonHdWallet.js";
import { sweepHdDepositAddressesOnce } from "./services/polygonHdSweep.js";

const logger = loggerLib.child("PhdServer");

function timingSafeEqualToken(a, b) {
  const aa = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (aa.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(aa, bb);
}

const port = Number.parseInt(process.env.PHD_PORT || process.env.PORT || "3847", 10);
const expectedToken = (process.env.PHD_INTERNAL_TOKEN || "").trim();

const app = express();
app.use(express.json({ limit: "8kb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "polygon-hd-deposit" });
});

app.post("/internal/hd/addresses", async (req, res) => {
  try {
    if (!expectedToken) {
      return res.status(503).json({ ok: false, message: "PHD_INTERNAL_TOKEN is not set." });
    }
    const auth = String(req.headers.authorization || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!timingSafeEqualToken(token, expectedToken)) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }

    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId) || userId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid userId." });
    }

    const row = await allocatePolygonHdAddress(userId);
    return res.json({
      ok: true,
      address: row.address,
      derivationIndex: row.derivationIndex,
      derivationPath: row.derivationPath
    });
  } catch (err) {
    logger.error("internal/hd/addresses failed", { error: err.message });
    return res.status(500).json({ ok: false, message: "Unable to allocate address." });
  }
});

app.listen(port, "0.0.0.0", () => {
  logger.info(`Polygon HD deposit service listening on ${port}`);
  if (process.env.POLYGON_HD_AUTO_SWEEP === "1") {
    const sweepCron = (process.env.POLYGON_HD_SWEEP_CRON || "*/5 * * * *").trim() || "*/5 * * * *";
    cron.schedule(sweepCron, () => {
      sweepHdDepositAddressesOnce().catch((err) =>
        logger.warn("HD sweep cron error", { error: err.message })
      );
    });
    logger.info(`POLYGON_HD_AUTO_SWEEP=1 — sweep cron ${sweepCron}`);
  }
});
