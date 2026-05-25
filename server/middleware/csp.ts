import type { IncomingMessage, ServerResponse } from "http";
import type { NextFunction, Request, Response } from "express";
import type { HelmetOptions } from "helmet";
import helmet from "helmet";
import { getIframeHostAllowlistCachedSync } from "../services/internalOfferwall/iframeHostAllowlistCache.js";
import { expandCspFrameSrcHostSources } from "../services/internalOfferwall/validateIframeUrl.js";

function isAssetPath(pathname: string | undefined): boolean {
  return Boolean(pathname && /\.(css|js|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(pathname));
}

function getRouteGroup(pathname: string | undefined): "api" | "asset" | "app" {
  const path = String(pathname || "/");
  if (path.startsWith("/api/")) return "api";
  if (isAssetPath(path)) return "asset";
  return "app";
}

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
  "https://explorer-api.walletconnect.org",
  "https://registry.walletconnect.com",
  "https://registry.walletconnect.org",
  "https://api.reown.com",
  "https://pulse.reown.com",
  "https://echo.reown.com",
  "https://notify.reown.com",
  "https://push.reown.com",
  "https://keys.reown.com",
] as const;

type CspDirectives = NonNullable<Exclude<HelmetOptions["contentSecurityPolicy"], boolean | undefined>["directives"]>;

function baseDirectives(opts: { allowWebSockets: boolean }): CspDirectives {
  const connectBase = opts.allowWebSockets
    ? ["'self'", "https:", "ws:", "wss:", "http://localhost:*", "ws://localhost:*"]
    : ["'self'", "https:"];

  const internalOfferwallFrameHosts = expandCspFrameSrcHostSources(getIframeHostAllowlistCachedSync());

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'", "https://genesisdao.tech", "https://www.genesisdao.tech"],
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
      "https://offerwall.me",
      "https://www.tradingview.com",
      "https://s.tradingview.com",
      "https://widget.tradingview.com",
      ...internalOfferwallFrameHosts,
    ],
    objectSrc: ["'none'"],
    scriptSrcAttr: ["'none'"],
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
      "https://cdn.zerion.io",
    ],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com", "https://fonts.reown.com", "data:"],
    scriptSrc:
      process.env.NODE_ENV === "production"
        ? [
            "'self'",
            (_req: IncomingMessage, res: ServerResponse) =>
              `'nonce-${(res as Response).locals.cspNonce || ""}'`,
            "'unsafe-eval'",
            "'sha256-NJS0Wtnrtaj0vSuZKVDn1gR0BSXI5XqyNQHem7I9CyM='",
            "'sha256-NzvNrqk5jB9YZATwo5BF4JoRlJ02HsnFikbKXgEPdaQ='",
            "https://challenges.cloudflare.com",
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
            "https://challenges.cloudflare.com",
            "https://cdn.jsdelivr.net",
            "https://www.googletagmanager.com",
            "https://www.youtube.com",
            "https://s.ytimg.com",
            "https://s3.tradingview.com",
            "https://www.tradingview.com",
            "https://s.tradingview.com",
          ],
    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
    connectSrc: [...connectBase, ...WALLETCONNECT_CONNECT],
    workerSrc: ["'self'", "blob:", "https:"],
  };
}

type CspConfig = Exclude<HelmetOptions["contentSecurityPolicy"], boolean | undefined>;

export function getHelmetContentSecurityPolicyOptions(): CspConfig {
  return {
    useDefaults: false,
    directives: baseDirectives({ allowWebSockets: true }),
  };
}

export function createCspMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const group = getRouteGroup(req.path);
    if (group === "api") {
      next();
      return;
    }
    const directives = baseDirectives({ allowWebSockets: true });
    helmet.contentSecurityPolicy({ useDefaults: false, directives })(req, res, next);
  };
}
