const WALLETCONNECT_PLACEHOLDER_IDS = new Set([
  "",
  "00000000000000000000000000000000",
  "your_project_id",
  "YOUR_PROJECT_ID",
  "changeme",
]);

export function isValidWalletConnectProjectId(projectId: string | undefined | null): projectId is string {
  const value = String(projectId ?? "").trim();
  if (WALLETCONNECT_PLACEHOLDER_IDS.has(value)) return false;
  return /^[a-f0-9]{32}$/i.test(value);
}

export function resolveWalletConnectProjectIdFromEnv(): string {
  const wc = String(process.env.VITE_WALLETCONNECT_PROJECT_ID ?? "").trim();
  const reown = String(process.env.VITE_REOWN_PROJECT_ID ?? "").trim();
  const candidate = wc || reown;
  return isValidWalletConnectProjectId(candidate) ? candidate : "";
}
