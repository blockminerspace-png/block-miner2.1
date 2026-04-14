/**
 * True if hostname matches an entry exactly or is a subdomain of an entry
 * (e.g. allowlist "example.com" matches "www.example.com" and "a.b.example.com").
 * @param {string} host
 * @param {Set<string>} allowedHosts
 */
export function hostMatchesIframeAllowlist(host, allowedHosts) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  if (allowedHosts.has(h)) return true;
  for (const entry of allowedHosts) {
    const e = String(entry || "").toLowerCase();
    if (!e) continue;
    if (h === e) return true;
    if (h.endsWith("." + e)) return true;
  }
  return false;
}

/**
 * frame-src sources for CSP: each allowlisted host plus wildcard subdomains.
 * @param {Set<string>} allowedHosts
 * @returns {string[]}
 */
export function expandCspFrameSrcHostSources(allowedHosts) {
  const out = [];
  const seen = new Set();
  for (const h of allowedHosts) {
    const host = String(h || "").trim().toLowerCase();
    if (!host) continue;
    if (host.includes(":")) continue;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const direct = `https://${host}`;
      if (!seen.has(direct)) {
        seen.add(direct);
        out.push(direct);
      }
      continue;
    }
    const direct = `https://${host}`;
    if (!seen.has(direct)) {
      seen.add(direct);
      out.push(direct);
    }
    const wild = `https://*.${host}`;
    if (!seen.has(wild)) {
      seen.add(wild);
      out.push(wild);
    }
  }
  return out;
}

/**
 * @param {string} rawUrl
 * @param {{ allowHttp: boolean, allowedHosts: Set<string> }} opts
 * @returns {{ ok: true, url: string } | { ok: false, code: string, message: string, host?: string }}
 */
export function validateIframeUrl(rawUrl, { allowHttp, allowedHosts }) {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return { ok: false, code: "IFRAME_URL_REQUIRED", message: "Iframe URL is required for PTC offers." };
  }
  if (trimmed.length > 2048) {
    return { ok: false, code: "IFRAME_URL_TOO_LONG", message: "Iframe URL is too long." };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, code: "IFRAME_URL_INVALID", message: "Iframe URL is not a valid URL." };
  }
  const proto = parsed.protocol.replace(":", "").toLowerCase();
  if (proto === "https") {
    // ok
  } else if (proto === "http" && allowHttp) {
    // ok (dev / test VM only)
  } else {
    return { ok: false, code: "IFRAME_URL_SCHEME", message: "Only https URLs are allowed for iframe content." };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost") {
    return { ok: false, code: "IFRAME_URL_HOST", message: "Invalid iframe host." };
  }
  if (!hostMatchesIframeAllowlist(host, allowedHosts)) {
    return {
      ok: false,
      code: "IFRAME_URL_NOT_ALLOWED",
      host,
      message: "Iframe host is not on the allowlist (refresh the allowlist cache or save the offer again to register the host)."
    };
  }
  return { ok: true, url: parsed.toString() };
}

export function isAllowHttpIframe() {
  const v = String(process.env.INTERNAL_OFFERWALL_ALLOW_HTTP_IFRAME || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
