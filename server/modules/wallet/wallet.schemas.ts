import { z } from "zod";
import { EVM_ADDRESS_REGEX } from "./wallet.security.js";
import { WITHDRAW_MIN_POL, VALID_MINING_PAYOUT_MODES } from "./wallet.types.js";

export const withdrawRequestSchema = z.object({
  amount: z.coerce
    .number()
    .refine((n) => !Number.isNaN(n) && n >= WITHDRAW_MIN_POL, {
      message: `Minimum withdrawal is ${WITHDRAW_MIN_POL} POL.`,
    }),
  address: z
    .string()
    .min(1)
    .refine((a) => EVM_ADDRESS_REGEX.test(a), { message: "Invalid wallet address format." }),
});

export const updateWalletAddressSchema = z.object({
  walletAddress: z.string().min(1),
  signature: z.string().min(1),
});

const evmAddressSchema = z
  .string()
  .trim()
  .refine((a) => EVM_ADDRESS_REGEX.test(a), { message: "Invalid wallet address format." });

export const walletLinkChallengeBodySchema = z
  .object({
    address: evmAddressSchema,
    chainId: z.coerce.number().int().positive(),
  })
  .strict();

export const walletLinkVerifyBodySchema = z
  .object({
    address: evmAddressSchema,
    chainId: z.coerce.number().int().positive(),
    signature: z.string().min(1),
  })
  .strict();

export const miningPayoutModeSchema = z.object({
  mode: z
    .string()
    .transform((s) => s.toLowerCase().trim())
    .refine((m) => VALID_MINING_PAYOUT_MODES.has(m), {
      message: "Invalid mode. Only 'pol' is supported.",
    }),
});

export const postDepositEstimateGasSchema = z.object({
  from: z.string().refine((s) => EVM_ADDRESS_REGEX.test(s)),
  to: z.string().refine((s) => EVM_ADDRESS_REGEX.test(s)),
  valueHex: z.string().regex(/^0x[0-9a-fA-F]+$/),
  data: z.string().optional(),
});
