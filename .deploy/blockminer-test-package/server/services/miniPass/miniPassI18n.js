/**
 * Picks a localized string from admin-authored JSON blobs ({ en, ptBR, es, ... }).
 */
export function pickMiniPassI18n(obj, acceptLanguageHeader) {
  if (!obj || typeof obj !== "object") return "";
  const raw = String(acceptLanguageHeader || "").split(",")[0]?.trim().toLowerCase() || "en";
  const norm = raw.replace("_", "-");
  if (norm.startsWith("pt")) return String(obj.ptBR ?? obj.pt ?? obj.en ?? obj.es ?? "");
  if (norm.startsWith("es")) return String(obj.es ?? obj.en ?? obj.ptBR ?? "");
  return String(obj.en ?? obj.ptBR ?? obj.es ?? "");
}
