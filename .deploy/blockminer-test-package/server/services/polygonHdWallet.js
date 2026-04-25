import { HDNodeWallet, getAddress } from "ethers";
import prisma from "../src/db/prisma.js";
import { getSecretValue } from "../utils/secretValue.js";

const DERIVATION_PREFIX = "m/44'/60'/0'/0";

/**
 * @param {string} mnemonic
 * @param {number} index
 * @returns {{ address: string, derivationPath: string, derivationIndex: number }}
 */
export function derivePolygonHdAddressAtIndex(mnemonic, index) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid derivation index");
  }
  const phrase = mnemonic.trim();
  const derivationPath = `${DERIVATION_PREFIX}/${index}`;
  /** ethers v6: full path as third arg derives in one step (avoid derivePath from a non-root node). */
  const wallet = HDNodeWallet.fromPhrase(phrase, undefined, derivationPath);
  return {
    address: getAddress(wallet.address),
    derivationPath,
    derivationIndex: index
  };
}

/**
 * Allocates or returns the user's unique HD deposit row (requires POLYGON_HD_MNEMONIC in this process).
 * @param {number} userId
 */
export async function allocatePolygonHdAddress(userId) {
  const mnemonic = getSecretValue("POLYGON_HD_MNEMONIC");
  if (!mnemonic) {
    throw new Error("POLYGON_HD_MNEMONIC is not configured in this process");
  }

  return prisma.$transaction(async (ptx) => {
    const existing = await ptx.polygonHdAddress.findUnique({ where: { userId } });
    if (existing) {
      return existing;
    }

    const agg = await ptx.polygonHdAddress.aggregate({ _max: { derivationIndex: true } });
    const nextIndex = (agg._max.derivationIndex ?? -1) + 1;
    const derived = derivePolygonHdAddressAtIndex(mnemonic, nextIndex);

    try {
      return await ptx.polygonHdAddress.create({
        data: {
          userId,
          derivationIndex: derived.derivationIndex,
          address: derived.address,
          derivationPath: derived.derivationPath
        }
      });
    } catch (e) {
      if (e?.code === "P2002") {
        const again = await ptx.polygonHdAddress.findUnique({ where: { userId } });
        if (again) {
          return again;
        }
      }
      throw e;
    }
  });
}

/**
 * Calls the dedicated PHD container (same repo, server/phdServer.js).
 * @param {number} userId
 * @returns {Promise<{ address: string, derivationIndex: number, derivationPath: string }>}
 */
export async function allocatePolygonHdAddressRemote(userId) {
  const baseUrl = (process.env.PHD_SERVICE_URL || "").trim().replace(/\/$/, "");
  const token = getSecretValue("PHD_INTERNAL_TOKEN");
  if (!baseUrl || !token) {
    throw new Error("PHD_SERVICE_URL and PHD_INTERNAL_TOKEN must be set for remote PHD");
  }

  const r = await fetch(`${baseUrl}/internal/hd/addresses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ userId })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data?.ok) {
    const msg = typeof data?.message === "string" ? data.message : `PHD HTTP ${r.status}`;
    throw new Error(msg);
  }
  return {
    address: data.address,
    derivationIndex: data.derivationIndex,
    derivationPath: data.derivationPath
  };
}
