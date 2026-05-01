function firstNonEmpty(values = []) {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function normalizeExplicitLanguage(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("pt")) return "pt-BR";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("en")) return "en";
  return null;
}

export function normalizeBrowserLanguage(raw) {
  const explicit = normalizeExplicitLanguage(raw);
  if (explicit === "pt-BR" || explicit === "es" || explicit === "en") return explicit;
  return "en";
}

export function extractCookieLanguage(cookieString = "") {
  const match = String(cookieString || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("i18next="));
  if (!match) return null;
  return decodeURIComponent(match.slice("i18next=".length));
}

export function resolveInitialLanguage({
  search = "",
  storedLanguage = "",
  storedLanguageUserSet = false,
  cookieString = "",
  htmlLang = "",
  navigatorLanguage = "",
  navigatorLanguages = [],
} = {}) {
  const queryLanguage = (() => {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return params.get("lng");
  })();

  const explicit = firstNonEmpty([
    queryLanguage,
    storedLanguageUserSet ? storedLanguage : "",
    extractCookieLanguage(cookieString),
  ]);
  const explicitLanguage = normalizeExplicitLanguage(explicit);
  if (explicitLanguage) return explicitLanguage;

  const browserRaw = firstNonEmpty([
    ...(Array.isArray(navigatorLanguages) ? navigatorLanguages : []),
    navigatorLanguage,
    htmlLang,
  ]);
  return normalizeBrowserLanguage(browserRaw);
}

export function resolveFallbackLanguages(activeLanguage) {
  const normalized = normalizeExplicitLanguage(activeLanguage) || "en";
  if (normalized === "pt-BR") return ["pt-BR", "en", "es"];
  if (normalized === "es") return ["es", "en", "pt-BR"];
  return ["en", "pt-BR", "es"];
}
