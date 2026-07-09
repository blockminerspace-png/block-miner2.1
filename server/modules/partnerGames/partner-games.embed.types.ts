/** Result of probing whether BlockMiner can embed a partner URL in an iframe. */
export type PartnerEmbedStatus =
  | "embeddable"
  | "blocked_x_frame_options"
  | "blocked_frame_ancestors"
  | "blocked_cloudflare"
  | "auth_page"
  | "api_endpoint"
  | "fetch_error"
  | "unknown";

export interface PartnerEmbedProbeResult {
  status: PartnerEmbedStatus;
  /** Human-readable reason for UI (pt-BR default). */
  reason: string;
  /** Machine code for i18n key suffix. */
  reasonCode: string;
  probedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  xFrameOptions: string | null;
  frameAncestors: string | null;
  contentType: string | null;
  isCloudflareChallenge: boolean;
  isJsonResponse: boolean;
  probedAt: string;
}

export const BLOCKMINER_EMBED_ORIGIN = "https://blockminer.space";

/** Hosts known to break when embedded (login redirect / embed mode bug). */
export const PARTNER_EXTERNAL_ONLY_HOSTS = ["minercore.online"] as const;
