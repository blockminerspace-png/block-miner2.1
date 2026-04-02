import prisma from "../src/db/prisma.js";
import loggerNamespace from "../utils/logger.js";
import crypto from "crypto";

const logger = loggerNamespace.child("OfferwallController");

export async function offerwallMePostback(req, res) {
  try {
    // Determine if it's GET or POST
    const data = Object.keys(req.body).length > 0 ? req.body : req.query;

    logger.info("Entry: Offerwall.me postback received", { 
      method: req.method, 
      url: req.originalUrl,
      body: req.body,
      query: req.query,
      headers: req.headers
    });

    // Standard Offerwall.me S2S Postback parameters
    const userIdRaw = data.subId;
    const txId = data.transId;
    const amountRaw = data.reward;
    const offerName = data.offer_name;
    const offerType = data.offer_type;
    const rewardName = data.reward_name;
    const payout = data.payout;
    const userIp = data.userIp || req.headers['x-forwarded-for'] || req.ip;
    const statusRaw = String(data.status); // 1 = credit, 2 = revoke
    const isDebug = String(data.debug) === "1";
    const signature = data.signature;

    if (!userIdRaw || !amountRaw || !txId) {
      logger.warn("Missing required postback parameters", { data });
      return res.status(400).send("Missing parameters");
    }

    const userId = parseInt(userIdRaw, 10);
    const amount = parseFloat(amountRaw);

    if (isNaN(userId) || isNaN(amount)) {
      return res.status(400).send("Invalid userId or amount");
    }

    // Optional: Secret key verification
    const secretKey = process.env.OFFERWALL_ME_SECRET;
    if (secretKey && signature) {
      // Typically MD5 verification, e.g. md5(subId + transId + reward + secretKey)
      // Implement specific logic here if required by Offerwall.me documentation
    }

    // If it's a test postback, just return OK to validate the endpoint
    if (isDebug) {
       logger.info("Offerwall.me debug postback received", { data });
       return res.status(200).send("OK");
    }

    const isChargeback = (statusRaw === "2" || statusRaw === "chargeback" || statusRaw === "revoke" || statusRaw === "reversed");

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Use a transaction to ensure idempotency
    await prisma.$transaction(async (tx) => {
      // Check if transaction already processed
      const existingCb = await tx.offerwallCallback.findUnique({
        where: { transactionId: String(txId) }
      });

      if (existingCb) {
        if (existingCb.status === "completed" && isChargeback) {
          // Process chargeback on an already paid tx
          await tx.user.update({
            where: { id: userId },
            data: { polBalance: { decrement: amount } }
          });
          
          await tx.offerwallCallback.update({
            where: { id: existingCb.id },
            data: { status: "chargeback" }
          });
          
          await tx.auditLog.create({
            data: {
              user: { connect: { id: userId } },
              action: "OFFERWALL_CHARGEBACK",
              detailsJson: JSON.stringify({ provider: "offerwall.me", txId, amount }),
              ip: userIp
            }
          });
        }
        return; // Already processed otherwise
      }

      if (!isChargeback) {
        // Create new callback and credit user
        await tx.offerwallCallback.create({
          data: {
            user: { connect: { id: userId } },
            provider: "offerwall.me",
            transactionId: String(txId),
            amount,
            status: "completed",
            requestIp: userIp,
          }
        });

        await tx.user.update({
          where: { id: userId },
          data: { polBalance: { increment: amount } }
        });

        await tx.auditLog.create({
          data: {
            user: { connect: { id: userId } },
            action: "OFFERWALL_CREDIT",
            detailsJson: JSON.stringify({ provider: "offerwall.me", txId, amount }),
            ip: userIp
          }
        });

        // Create notification for the user
        await tx.notification.create({
          data: {
            user: { connect: { id: userId } },
            title: "Offerwall.me Recompensa",
            message: `Você recebeu ${amount} POL por completar uma oferta no Offerwall.me!`,
            type: "reward"
          }
        });
      }
    });

    // Sync Engine to reflect balance update
    import("../src/runtime/miningRuntime.js").then(({ applyUserBalanceDelta }) => {
      applyUserBalanceDelta(userId, amount);
    }).catch(e => logger.error("Failed to sync offerwall balance to engine", e));

    // Offerwalls usually expect a 200 OK "1", "OK", or "SUCCESS"
    return res.status(200).send("OK");
  } catch (error) {
    logger.error("Error processing offerwall.me postback", { error: error.message });
    return res.status(500).send("Internal Server Error");
  }
}
