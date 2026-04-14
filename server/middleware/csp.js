import helmet from "helmet";
import { getIframeHostAllowlistCachedSync } from "../services/internalOfferwall/iframeHostAllowlistCache.js";
import { expandCspFrameSrcHostSources } from "../services/internalOfferwall/validateIframeUrl.js";

function isAssetPath(pathname) {
  return Boolean(pathname && /\.(css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(pathname));
}

function getRouteGroup(pathname) {
  const path = String(pathname || "/");
  if (path.startsWith("/api/")) return "api";
  if (isAssetPath(path)) return "asset";
  return "app";
}

/** Reown AppKit / WalletConnect — https://docs.reown.com/advanced/security/content-security-policy */
const WALLETCONNECT_CONNECT = [
  "https://rpc.walletconnect.com",
  "https://rpc.walletconnect.org",
  "https://relay.walletconnect.com",
  "https://relay.walletconnect.org",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "https://pulse.walletconnect.com",
  "https://pulse.walletconnect.org",
  "https://api.web3modal.com",
  "https://api.web3modal.org",
  "https://keys.walletconnect.com",
  "https://keys.walletconnect.org",
  "https://notify.walletconnect.com",
  "https://notify.walletconnect.org",
  "https://echo.walletconnect.com",
  "https://echo.walletconnect.org",
  "https://push.walletconnect.com",
  "https://push.walletconnect.org",
  "wss://www.walletlink.org",
  "https://cca-lite.coinbase.com",
  "https://explorer-api.walletconnect.com",
  "https://registry.walletconnect.com",
  // Reown may route some traffic here on newer SDKs; keep explicit for stricter CSPs without https:.
  "https://api.reown.com",
  "https://pulse.reown.com",
  "https://echo.reown.com",
  "https://notify.reown.com",
  "https://push.reown.com",
  "https://keys.reown.com"
];

function baseDirectives({ allowWebSockets }) {
  const connectBase = allowWebSockets
    ? ["'self'", "https:", "ws:", "wss:", "http://localhost:*", "ws://localhost:*"]
    : ["'self'", "https:"];

  const internalOfferwallFrameHosts = expandCspFrameSrcHostSources(getIframeHostAllowlistCachedSync());

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    frameSrc: [
      "'self'",
      "https://challenges.cloudflare.com",
      "https://verify.walletconnect.com",
      "https://verify.walletconnect.org",
      "https://secure.walletconnect.com",
      "https://secure.walletconnect.org",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://ad.a-ads.com",
      "https://zerads.com",
      "https://www.tradingview.com",
      "https://s.tradingview.com",
      "https://widget.tradingview.com",
      ...internalOfferwallFrameHosts
    ],
    objectSrc: ["'none'"],
    scriptSrcAttr: ["'none'"],
    // AppKit wallet grid uses blob: URLs and many icon hosts; Reown recommends img-src * … blob:
    imgSrc: [
      "*",
      "'self'",
      "data:",
      "blob:",
      "https://walletconnect.org",
      "https://walletconnect.com",
      "https://secure.walletconnect.com",
      "https://secure.walletconnect.org",
      "https://tokens-data.1inch.io",
      "https://tokens.1inch.io",
      "https://ipfs.io",
      "https://cdn.zerion.io"
    ],
    fontSrc: [
      "'self'",
      "https://cdn.jsdelivr.net",
      "https://fonts.gstatic.com",
      "https://fonts.reown.com",
      "data:"
    ],
    scriptSrc:
      process.env.NODE_ENV === "production"
        ? [
            "'self'",
            /** Per-request nonce set in server bootstrap (reduces XSS blast radius vs blanket unsafe-inline). */
            (req, res) => `'nonce-${res.locals.cspNonce || ""}'`,
            "'unsafe-eval'",
            "https://cdn.jsdelivr.net",
            "https://www.googletagmanager.com",
            "https://www.youtube.com",
            "https://s.ytimg.com",
            "https://s3.tradingview.com",
            "https://www.tradingview.com",
            "https://s.tradingview.com",
          ]
        : [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://cdn.jsdelivr.net",
            "https://www.googletagmanager.com",
            "https://www.youtube.com",
            "https://s.ytimg.com",
            "https://s3.tradingview.com",
            "https://www.tradingview.com",
            "https://s.tradingview.com",
          ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://cdn.jsdelivr.net",
      "https://fonts.googleapis.com"
    ],
    connectSrc: [...connectBase, ...WALLETCONNECT_CONNECT],
    workerSrc: ["'self'", "blob:", "https:"]
  };
}

/**
 * Helmet-compatible CSP options (single policy for all responses — safe for JSON routes; browsers
 * enforce CSP primarily on document navigations).
 */
export function getHelmetContentSecurityPolicyOptions() {
  return {
    useDefaults: false,
    directives: baseDirectives({ allowWebSockets: true }),
  };
}

/**
 * @deprecated Prefer `getHelmetContentSecurityPolicyOptions()` with `helmet()` in server bootstrap.
 */
export function createCspMiddleware() {
  return (req, res, next) => {
    const group = getRouteGroup(req.path);
    if (group === "api") {
      next();
      return;
    }
    const directives = baseDirectives({ allowWebSockets: true });
    helmet.contentSecurityPolicy({ useDefaults: false, directives })(req, res, next);
  };
}
