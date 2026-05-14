/** Narrowing helpers for strict controller code (no `any`). */

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function prismaErrCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const code = Reflect.get(e, "code");
  return typeof code === "string" ? code : undefined;
}

/** Express `req.params` values may be typed as `string | string[]`. */
export function paramStr(v: string | string[] | undefined): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v[0] : v;
  return s == null ? "" : String(s);
}
