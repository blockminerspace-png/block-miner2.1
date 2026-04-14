import {
  OFFER_KIND_GENERAL_TASK,
  OFFER_KIND_PTC_IFRAME,
  RESET_TYPE_COOLDOWN,
  RESET_TYPE_DAILY
} from "./internalOfferwallConstants.js";
import { getIframeHostAllowlistCachedSync } from "./iframeHostAllowlistCache.js";
import { isAllowHttpIframe, validateIframeUrl } from "./validateIframeUrl.js";

/**
 * @param {unknown} raw
 * @returns {object | null}
 */
function asObject(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return /** @type {object} */ (raw);
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {string} kind
 * @param {unknown} raw
 * @param {{ allowHttp?: boolean, allowedHosts?: Set<string> }} [options]
 * @returns {{ ok: true, value: object | null } | { ok: false, message: string, code?: string, host?: string }}
 */
export function normalizeTaskMetadata(kind, raw, options = {}) {
  const obj = asObject(raw);
  if (!obj) return { ok: true, value: null };

  const allowHttp = options.allowHttp ?? isAllowHttpIframe();
  const allowedHosts = options.allowedHosts ?? getIframeHostAllowlistCachedSync();

  const out = {};

  const actionsRaw = obj.requiredActions;
  if (actionsRaw !== undefined) {
    if (!Array.isArray(actionsRaw)) {
      return { ok: false, message: "taskMetadata.requiredActions must be an array." };
    }
    if (actionsRaw.length > 15) {
      return { ok: false, message: "taskMetadata.requiredActions allows at most 15 items." };
    }
    const requiredActions = [];
    for (const a of actionsRaw) {
      const s = String(a ?? "").trim();
      if (!s) continue;
      if (s.length > 500) {
        return { ok: false, message: "Each required action must be at most 500 characters." };
      }
      requiredActions.push(s);
    }
    if (requiredActions.length) out.requiredActions = requiredActions;
  }

  const countriesRaw = obj.targetCountryCodes;
  if (countriesRaw !== undefined) {
    if (!Array.isArray(countriesRaw)) {
      return { ok: false, message: "taskMetadata.targetCountryCodes must be an array." };
    }
    if (countriesRaw.length > 60) {
      return { ok: false, message: "taskMetadata.targetCountryCodes allows at most 60 items." };
    }
    const targetCountryCodes = [];
    for (const c of countriesRaw) {
      const u = String(c ?? "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(u)) {
        return { ok: false, message: "targetCountryCodes must be ISO 3166-1 alpha-2 codes." };
      }
      targetCountryCodes.push(u);
    }
    if (targetCountryCodes.length) out.targetCountryCodes = targetCountryCodes;
  }

  const ext = obj.externalInfoUrl;
  if (ext !== undefined && ext !== null && String(ext).trim()) {
    if (kind !== OFFER_KIND_GENERAL_TASK) {
      return { ok: false, message: "externalInfoUrl is only allowed for GENERAL_TASK offers." };
    }
    const vr = validateIframeUrl(String(ext), {
      allowHttp,
      allowedHosts
    });
    if (!vr.ok) {
      return {
        ok: false,
        message: vr.message,
        ...(vr.code ? { code: vr.code } : {}),
        ...(vr.host ? { host: vr.host } : {})
      };
    }
    out.externalInfoUrl = vr.url;
  }

  const verificationNote = obj.verificationNote;
  if (verificationNote !== undefined && verificationNote !== null && String(verificationNote).trim()) {
    const s = String(verificationNote).trim().slice(0, 2000);
    out.verificationNote = s;
  }

  if (obj.resetType !== undefined && obj.resetType !== null && String(obj.resetType).trim() !== "") {
    const rt = String(obj.resetType).trim().toUpperCase();
    if (rt !== RESET_TYPE_DAILY && rt !== RESET_TYPE_COOLDOWN) {
      return { ok: false, message: "taskMetadata.resetType must be DAILY or COOLDOWN." };
    }
    out.resetType = rt;
  }

  if (obj.cooldownSeconds !== undefined && obj.cooldownSeconds !== null && String(obj.cooldownSeconds).trim() !== "") {
    const n = Math.floor(Number(obj.cooldownSeconds));
    if (!Number.isFinite(n)) {
      return { ok: false, message: "taskMetadata.cooldownSeconds must be a number." };
    }
    out.cooldownSeconds = Math.min(86400 * 7, Math.max(60, n));
  }

  return { ok: true, value: Object.keys(out).length ? out : null };
}
