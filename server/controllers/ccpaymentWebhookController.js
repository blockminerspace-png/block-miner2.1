/**
 * CCPayment API deposit webhook HTTP handler.
 * Must receive raw JSON body (express.raw) for signature verification.
 * @see https://docs.ccpayment.com/ccpayment-v1.0-api/webhook-notification/api-deposit-webhook-notification
 */

import loggerLib from "../utils/logger.js";
import { getWebhookClientIp } from "../middleware/ccpaymentWebhookIp.js";
import {
  verifyCcpaymentWebhookRequest,
  processCcpaymentDepositBody,
  CcpaymentWebhookError
} from "../services/ccpayment/ccpaymentDepositWebhookService.js";

const logger = loggerLib.child("CcpaymentWebhookController");

/**
 * POST /api/wallet/ccpayment/deposit-webhook
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleCcpaymentDepositWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
  const clientIp = getWebhookClientIp(req);

  try {
    verifyCcpaymentWebhookRequest(rawBody, req.headers);
  } catch (err) {
    if (err instanceof CcpaymentWebhookError) {
      logger.warn("CCPayment webhook rejected", { code: err.code, status: err.httpStatus });
      return res.status(err.httpStatus).type("text/plain").send(err.code);
    }
    throw err;
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).type("text/plain").send("BAD_JSON");
  }

  try {
    await processCcpaymentDepositBody(body, { clientIp });
    return res.status(200).type("text/plain").send("success");
  } catch (e) {
    logger.error("CCPayment deposit process failed", { message: e?.message });
    return res.status(500).type("text/plain").send("PROCESS_ERROR");
  }
}
