import express from "express";
import prisma from "../src/db/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const broadcastRouter = express.Router();

// GET /api/broadcast/active
// Returns the newest active broadcast message not yet seen by this user
broadcastRouter.get("/active", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const message = await prisma.broadcastMessage.findFirst({
      where: {
        isActive: true,
        views: { none: { userId } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ ok: true, message: message || null });
  } catch (err) {
    console.error("broadcast/active error:", err);
    res.status(500).json({ ok: false });
  }
});

// POST /api/broadcast/:id/dismiss
// Marks message as seen for this user
broadcastRouter.post("/:id/dismiss", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = Number(req.params.id);

    await prisma.broadcastMessageView.upsert({
      where: { userId_messageId: { userId, messageId } },
      update: {},
      create: { userId, messageId },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("broadcast/dismiss error:", err);
    res.status(500).json({ ok: false });
  }
});
