import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export const INBOX_SOURCE_CHECKIN = "checkin_milestone";
export const INBOX_SOURCE_DAILY_TASK = "daily_task";
export const INBOX_SOURCE_OFFERWALL = "offerwall";

export type InboxRewardPayload = {
  userId: number;
  source: string;
  rewardType: string;
  rewardValue: number | string;
  minerId?: number | null;
  minerName?: string | null;
  minerImageUrl?: string | null;
  slotSize?: number;
  durationHours?: number | null;
  metaJson?: Record<string, unknown> | null;
};

export async function createRewardInboxEntry(
  tx: Prisma.TransactionClient | PrismaClient,
  payload: InboxRewardPayload,
) {
  return tx.userRewardInbox.create({
    data: {
      userId: payload.userId,
      status: "pending",
      source: payload.source,
      rewardType: payload.rewardType,
      rewardValue: new Prisma.Decimal(String(payload.rewardValue)),
      minerId: payload.minerId ?? null,
      minerName: payload.minerName ?? null,
      minerImageUrl: payload.minerImageUrl ?? null,
      slotSize: payload.slotSize ?? 1,
      durationHours: payload.durationHours ?? null,
      metaJson: (payload.metaJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
