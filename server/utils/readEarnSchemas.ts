import { z } from "zod";
import {
  READ_EARN_BLK,
  READ_EARN_HASHRATE,
  READ_EARN_MACHINE,
  READ_EARN_REWARD_TYPES
} from "./readEarnConstants.js";

function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const rewardTypeZ = z.enum([READ_EARN_HASHRATE, READ_EARN_BLK, READ_EARN_MACHINE]);

const baseFields = {
  title: z.string().trim().min(1).max(200),
  partnerUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .refine(isHttpUrl, "partnerUrl must be a valid http(s) URL"),
  rewardType: z
    .string()
    .transform((s) => s.toLowerCase())
    .pipe(rewardTypeZ),
  rewardAmount: z.coerce.number().finite().positive(),
  rewardMinerId: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce.number().int().positive().nullable().optional()
  ),
  hashrateValidityDays: z.coerce.number().int().min(1).max(365).default(7),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  maxRedemptions: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.union([z.coerce.number().int().positive(), z.null()]).optional()
  ),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.coerce.boolean().default(true)
};

export const readEarnAdminCreateSchema = z
  .object({
    ...baseFields,
    rewardCode: z.string().min(6).max(128)
  })
  .superRefine((data, ctx) => {
    if (data.expiresAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be after startsAt"
      });
    }
    if (data.rewardType === READ_EARN_MACHINE && !data.rewardMinerId) {
      ctx.addIssue({
        code: "custom",
        path: ["rewardMinerId"],
        message: "rewardMinerId is required when rewardType is machine"
      });
    }
  });

export const readEarnAdminUpdateSchema = z
  .object({
    title: baseFields.title.optional(),
    partnerUrl: z
      .string()
      .trim()
      .min(1)
      .max(2048)
      .refine(isHttpUrl, "partnerUrl must be a valid http(s) URL")
      .optional(),
    rewardType: z
      .string()
      .transform((s) => s.toLowerCase())
      .pipe(rewardTypeZ)
      .optional(),
    rewardAmount: z.coerce.number().finite().positive().optional(),
    rewardMinerId: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v),
      z.coerce.number().int().positive().nullable().optional()
    ),
    hashrateValidityDays: z.coerce.number().int().min(1).max(365).optional(),
    startsAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
    maxRedemptions: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : v === null ? null : v),
      z.union([z.coerce.number().int().positive(), z.null()]).optional()
    ),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.coerce.boolean().optional(),
    rewardCode: z.string().min(6).max(128).optional()
  })
  .superRefine((data, ctx) => {
    if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be after startsAt"
      });
    }
  });

export const readEarnRedeemBodySchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  code: z.string().min(1).max(128)
});

export function parseReadEarnCreate(body) {
  return readEarnAdminCreateSchema.parse(body);
}

export function parseReadEarnUpdate(body) {
  return readEarnAdminUpdateSchema.parse(body);
}

export function parseReadEarnRedeem(body) {
  return readEarnRedeemBodySchema.parse(body);
}

export { READ_EARN_REWARD_TYPES };
