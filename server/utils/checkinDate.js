/** Calendar date in America/Sao_Paulo (same semantics as streak math in addDaysToBrazilDateKey). */
export function getBrazilCheckinDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Calendar day in America/Sao_Paulo, offset by whole days (streak math). */
export function addDaysToBrazilDateKey(dateKey, deltaDays) {
  const [Y, M, D] = dateKey.split("-").map(Number);
  const noonBrUtc = new Date(Date.UTC(Y, M - 1, D, 15, 0, 0));
  const shifted = new Date(noonBrUtc.getTime() + Number(deltaDays) * 86400000);
  return shifted.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
