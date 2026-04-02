export function getBrazilCheckinDateKey(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const brDate = new Date(utc + 3600000 * -3);
  const yyyy = brDate.getFullYear();
  const mm = String(brDate.getMonth() + 1).padStart(2, "0");
  const dd = String(brDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Calendar day in America/Sao_Paulo, offset by whole days (streak math). */
export function addDaysToBrazilDateKey(dateKey, deltaDays) {
  const [Y, M, D] = dateKey.split("-").map(Number);
  const noonBrUtc = new Date(Date.UTC(Y, M - 1, D, 15, 0, 0));
  const shifted = new Date(noonBrUtc.getTime() + Number(deltaDays) * 86400000);
  return shifted.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
