import loggerLib from "../../utils/logger.js";
import type { PartnerEmbedProbeResult, PartnerEmbedStatus } from "./partner-games.embed.types.js";
import { BLOCKMINER_EMBED_ORIGIN, PARTNER_EXTERNAL_ONLY_HOSTS } from "./partner-games.embed.types.js";

const log = loggerLib.child("PartnerEmbedProbe");
const PROBE_TIMEOUT_MS = 12_000;
const USER_AGENT = "BlockMinerEmbedProbe/1.0 (+https://blockminer.space)";

function parseFrameAncestors(csp: string | null): string | null {
  if (!csp) return null;
  const m = csp.match(/frame-ancestors\s+([^;]+)/i);
  return m ? m[1].trim() : null;
}

function frameAncestorsBlocksCrossOrigin(frameAncestors: string | null): boolean {
  if (!frameAncestors) return false;
  const fa = frameAncestors.toLowerCase();
  if (fa.includes("*")) return false;
  if (fa.includes("'none'")) return true;
  if (fa.includes("'self'") && !fa.includes("blockminer.space")) return true;
  if (!fa.includes("blockminer.space")) return true;
  return false;
}

function xFrameOptionsBlocks(xfo: string | null): boolean {
  if (!xfo) return false;
  const v = xfo.trim().toUpperCase();
  return v === "DENY" || v === "SAMEORIGIN";
}

function isAuthPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      path.includes("/register") ||
      path.includes("/login") ||
      path.includes("/signup") ||
      path.startsWith("/api/")
    );
  } catch {
    return true;
  }
}

function buildReason(status: PartnerEmbedStatus): { reason: string; reasonCode: string } {
  switch (status) {
    case "embeddable":
      return { reason: "Parceiro permite iframe.", reasonCode: "embeddable" };
    case "blocked_x_frame_options":
      return {
        reason: "X-Frame-Options do parceiro bloqueia embed cross-origin.",
        reasonCode: "blocked_x_frame_options",
      };
    case "blocked_frame_ancestors":
      return {
        reason: "CSP frame-ancestors do parceiro não inclui blockminer.space.",
        reasonCode: "blocked_frame_ancestors",
      };
    case "blocked_cloudflare":
      return {
        reason: "Cloudflare ou anti-bot bloqueou o carregamento (challenge).",
        reasonCode: "blocked_cloudflare",
      };
    case "auth_page":
      return {
        reason:
          "Login do parceiro não funciona dentro do iframe (use Abrir em nova aba).",
        reasonCode: "auth_page",
      };
    case "api_endpoint":
      return {
        reason: "URL responde JSON de API — não é uma página de jogo.",
        reasonCode: "api_endpoint",
      };
    case "fetch_error":
      return { reason: "Não foi possível contactar o parceiro (timeout/erro).", reasonCode: "fetch_error" };
    default:
      return { reason: "Compatibilidade de iframe desconhecida.", reasonCode: "unknown" };
  }
}

function isExternalOnlyHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return PARTNER_EXTERNAL_ONLY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function classifyProbe(input: {
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  xFrameOptions: string | null;
  frameAncestors: string | null;
  contentType: string | null;
  isCloudflareChallenge: boolean;
  isJsonResponse: boolean;
}): PartnerEmbedStatus {
  if (isExternalOnlyHost(input.url) || (input.finalUrl && isExternalOnlyHost(input.finalUrl))) {
    return "auth_page";
  }
  if (isAuthPath(input.url) || (input.finalUrl && isAuthPath(input.finalUrl))) {
    return "auth_page";
  }
  if (input.isJsonResponse) return "api_endpoint";
  if (input.isCloudflareChallenge || input.httpStatus === 403) {
    if (input.isCloudflareChallenge) return "blocked_cloudflare";
  }
  if (xFrameOptionsBlocks(input.xFrameOptions)) return "blocked_x_frame_options";
  if (frameAncestorsBlocksCrossOrigin(input.frameAncestors)) return "blocked_frame_ancestors";
  if (input.httpStatus != null && input.httpStatus >= 400) return "fetch_error";
  return "embeddable";
}

/** HTTP probe — checks headers the browser would enforce for iframe embed. */
export async function probePartnerEmbedUrl(rawUrl: string): Promise<PartnerEmbedProbeResult> {
  const probedAt = new Date().toISOString();
  let probedUrl = String(rawUrl ?? "").trim();
  if (!probedUrl) {
    const { reason, reasonCode } = buildReason("fetch_error");
    return {
      status: "fetch_error",
      reason,
      reasonCode,
      probedUrl: "",
      finalUrl: null,
      httpStatus: null,
      xFrameOptions: null,
      frameAncestors: null,
      contentType: null,
      isCloudflareChallenge: false,
      isJsonResponse: false,
      probedAt,
    };
  }

  try {
    new URL(probedUrl);
  } catch {
    const { reason, reasonCode } = buildReason("fetch_error");
    return {
      status: "fetch_error",
      reason,
      reasonCode,
      probedUrl,
      finalUrl: null,
      httpStatus: null,
      xFrameOptions: null,
      frameAncestors: null,
      contentType: null,
      isCloudflareChallenge: false,
      isJsonResponse: false,
      probedAt,
    };
  }

  if (isExternalOnlyHost(probedUrl)) {
    const { reason, reasonCode } = buildReason("auth_page");
    return {
      status: "auth_page",
      reason,
      reasonCode,
      probedUrl,
      finalUrl: probedUrl,
      httpStatus: null,
      xFrameOptions: null,
      frameAncestors: null,
      contentType: null,
      isCloudflareChallenge: false,
      isJsonResponse: false,
      probedAt,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(probedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
    });

    const finalUrl = res.url || probedUrl;
    const xFrameOptions = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy");
    const frameAncestors = parseFrameAncestors(csp);
    const contentType = res.headers.get("content-type");
    const bodySnippet = (await res.text()).slice(0, 512);
    const isCloudflareChallenge =
      res.headers.has("cf-mitigated") ||
      /just a moment/i.test(bodySnippet) ||
      /cdn-cgi\/challenge-platform/i.test(bodySnippet);
    const isJsonResponse =
      (contentType?.includes("application/json") ?? false) ||
      bodySnippet.trimStart().startsWith("{");

    const status = classifyProbe({
      url: probedUrl,
      finalUrl,
      httpStatus: res.status,
      xFrameOptions,
      frameAncestors,
      contentType,
      isCloudflareChallenge,
      isJsonResponse,
    });

    const { reason, reasonCode } = buildReason(status);

    log.info("partner_embed_probe", {
      probedUrl,
      finalUrl,
      status,
      httpStatus: res.status,
      xFrameOptions,
      frameAncestors,
      origin: BLOCKMINER_EMBED_ORIGIN,
    });

    return {
      status,
      reason,
      reasonCode,
      probedUrl,
      finalUrl,
      httpStatus: res.status,
      xFrameOptions,
      frameAncestors,
      contentType,
      isCloudflareChallenge,
      isJsonResponse,
      probedAt,
    };
  } catch (err) {
    log.warn("partner_embed_probe_failed", { probedUrl, err: String(err) });
    const { reason, reasonCode } = buildReason("fetch_error");
    return {
      status: "fetch_error",
      reason,
      reasonCode,
      probedUrl,
      finalUrl: null,
      httpStatus: null,
      xFrameOptions: null,
      frameAncestors: null,
      contentType: null,
      isCloudflareChallenge: false,
      isJsonResponse: false,
      probedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function launchModeFromProbe(probe: PartnerEmbedProbeResult): "iframe" | "external" {
  return probe.status === "embeddable" ? "iframe" : "external";
}
