import { getAddress } from "ethers";

/** Trim CRLF/spaces from env; return checksummed 0x address or null if missing/invalid. */
export function normalizeHexAddressEnv(value: string | undefined): string | null {
  const s = (value ?? "").trim().replace(/\r/g, "");
  if (!s) return null;
  try {
    return getAddress(s);
  } catch {
    return null;
  }
}

/** Same rule as legacy withdrawal validation (EVM hex address, 20 bytes). */
export const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
