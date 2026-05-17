import type { QueryRecord } from "../../services/queryRecord.js";
import { parseAdminMinerQuery, parseMinerWriteBody, validateMinerImageUrl } from "../../services/adminMinersService.js";

export function parseAdminMinersListQuery(query: QueryRecord = {}) {
  return parseAdminMinerQuery(query);
}

export function parseAdminMinerBody(body: QueryRecord = {}, opts: { partial?: boolean } = {}) {
  return parseMinerWriteBody(body, opts);
}

export { validateMinerImageUrl };
