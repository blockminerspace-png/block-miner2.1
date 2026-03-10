import crypto from "crypto";

export const CSRF_COOKIE_NAME = "blockminer_csrf";

function parseCookie(headerValue) {
  if (!headerValue) return {};
  return headerValue.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function buildCsrfCookie(token) {
  const parts = [`${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`, "Path=/", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const cookies = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...cookies, cookieValue]);
}

export function createCsrfMiddleware() {
  return (req, res, next) => {
    const cookies = parseCookie(req.headers.cookie || "");
    
    let csrfToken = cookies[CSRF_COOKIE_NAME];
    if (!csrfToken || csrfToken.length < 16) {
      csrfToken = crypto.randomBytes(24).toString("base64url");
      appendSetCookie(res, buildCsrfCookie(csrfToken));
    }

    res.locals.csrfToken = csrfToken;

    // VALIDATION: Check CSRF token for state-changing methods
    const method = req.method.toUpperCase();
    const url = req.originalUrl || req.url;

    // EXEMPTIONS: Do not check CSRF for socket.io or external callbacks
    if (url.includes('/socket.io/') || url.includes('/api/zerads/callback')) {
      return next();
    }

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const headerToken = req.headers["x-csrf-token"];
      
      if (!headerToken || headerToken !== csrfToken) {
        return res.status(403).json({ 
          ok: false, 
          message: "Ação bloqueada por segurança (CSRF). Por favor, recarregue a página." 
        });
      }
    }
    
    next();
  };
}
