import { z } from "zod";

/** Claim and partner/start use session auth only; no body fields required today. */
export const faucetPartnerStartBodySchema = z.object({}).strict().optional();

export const faucetClaimBodySchema = z.object({}).strict().optional();
