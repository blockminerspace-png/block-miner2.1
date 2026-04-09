/**
 * Admin: CCPayment deposit event monitoring (read-only).
 */

import prisma from "../src/db/prisma.js";

/**
 * GET /api/admin/ccpayment/deposits
 */
export async function adminListCcpaymentDeposits(req, res) {
  try {
    const take = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);
    const rows = await prisma.ccpaymentDepositEvent.findMany({
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });
    res.json({
      ok: true,
      deposits: rows.map((r) => ({
        id: r.id,
        recordId: r.recordId,
        orderId: r.orderId,
        userId: r.userId,
        amountPol: r.amountPol != null ? Number(r.amountPol) : null,
        txHash: r.txHash,
        payStatus: r.payStatus,
        credited: r.credited,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        user: r.user
      }))
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to list CCPayment deposits." });
  }
}
