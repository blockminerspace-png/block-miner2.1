import prisma from "../src/db/prisma.js";

/**
 * Admin: List all support messages.
 */
export const listMessages = async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          }
        }
      }
    });

    res.json({ ok: true, messages });
  } catch (error) {
    console.error("[AdminSupportController] Error listing messages:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Admin: Get specific message details.
 */
export const getMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          }
        },
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    // Mark as read if it wasn't
    if (!message.isRead) {
      await prisma.supportMessage.update({
        where: { id: parseInt(id) },
        data: { isRead: true }
      });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("[AdminSupportController] Error getting message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Admin: Reply to a message.
 */
export const replyToMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({ ok: false, message: "Reply content is required" });
    }

    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!message) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    // Save as a new reply and update original message status
    const result = await prisma.$transaction([
      prisma.supportReply.create({
        data: {
          supportMessageId: parseInt(id),
          message: reply,
          isAdmin: true
        }
      }),
      prisma.supportMessage.update({
        where: { id: parseInt(id) },
        data: {
          isReplied: true,
          repliedAt: new Date()
        }
      })
    ]);

    res.json({ ok: true, message: "Reply saved successfully", reply: result[0] });

  } catch (error) {
    console.error("[AdminSupportController] Error replying to message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
