import prisma from "../src/db/prisma.js";

/**
 * Public: Create a new support message.
 */
export const createMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const userId = req.user?.id || null;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ ok: false, message: "All fields are required" });
    }

    const newMessage = await prisma.supportMessage.create({
      data: {
        userId,
        name,
        email,
        subject,
        message,
      },
    });

    res.status(201).json({ ok: true, message: "Support message sent successfully", id: newMessage.id });
  } catch (error) {
    console.error("[SupportController] Error creating message:", error);
    res.status(500).json({ ok: false, message: "Error sending support message" });
  }
};


/**
 * Public: List user's support messages.
 */
export const listMessages = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const messages = await prisma.supportMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ ok: true, messages });
  } catch (error) {
    console.error("[SupportController] Error listing messages:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Public: Get user's specific support message with replies.
 */
export const getMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!message || message.userId !== userId) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("[SupportController] Error getting message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Public: User replies to a support message.
 */
export const replyToMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { message: replyContent } = req.body;

    if (!userId) return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (!replyContent) return res.status(400).json({ ok: false, message: "Message content is required" });

    const originalMessage = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!originalMessage || originalMessage.userId !== userId) {
      return res.status(404).json({ ok: false, message: "Support ticket not found" });
    }

    const newReply = await prisma.supportReply.create({
      data: {
        supportMessageId: parseInt(id),
        senderId: userId,
        message: replyContent,
        isAdmin: false
      }
    });

    res.status(201).json({ ok: true, reply: newReply });
  } catch (error) {
    console.error("[SupportController] Error replying to message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
