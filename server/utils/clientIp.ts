/**
 * Backward-compatible re-exports — prefer `server/modules/ip-intelligence`.
 */
import { getClientIp as readClientIp } from "../modules/ip-intelligence/ipAddress.js";

export {
  deriveDefaultNetworkCidr,
  getClientIp,
  isInfrastructureIp,
  isIpInCidr,
  isTrustedProxyAddress,
  normalizeIp,
  resolveClientIp,
} from "../modules/ip-intelligence/ipAddress.js";

export const getRequestIp = readClientIp;

export function getAnonymizedRequestIp(req: { headers?: Record<string, unknown>; socket?: { remoteAddress?: string } }) {
  const ip = readClientIp(req);
  if (!ip || ip === "::1" || ip === "127.0.0.1") return "127.0.0.x";
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  return `${ip.slice(0, 16)}...`;
}
