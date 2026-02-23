const ACCESS_COOKIE_NAME = "blockminer_access";
const REFRESH_COOKIE_NAME = "blockminer_refresh";
const LEGACY_SESSION_COOKIE = "blockminer_session";

function looksLikeJwt(value) {
  const token = String(value || "").trim();
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

function parseCookie(headerValue) {
  if (!headerValue) {
    return {};
  }

  return headerValue.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return acc;
    }

    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function getTokenFromRequest(req) {
  const cookies = parseCookie(req.headers.cookie || "");
  const cookieToken = cookies[ACCESS_COOKIE_NAME] || cookies[LEGACY_SESSION_COOKIE] || null;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (looksLikeJwt(bearer)) {
      return bearer;
    }
  }

  return null;
}

function getRefreshTokenFromRequest(req) {
  const cookies = parseCookie(req.headers.cookie || "");
  return cookies[REFRESH_COOKIE_NAME] || null;
}

module.exports = {
  getTokenFromRequest,
  getRefreshTokenFromRequest,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME
};
