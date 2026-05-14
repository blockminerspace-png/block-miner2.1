import prisma from "../../db/prisma.js";
import { buildAuditEventWhere } from "./filters.js";
import { buildCursorWhere, buildOrderBy, buildPageInfo, decodeAuditCursor } from "./pagination.js";

export async function fetchAuditEvents({ query }) {
  const parsed = query;
  const cursor = decodeAuditCursor(parsed.cursor);
  const cursorWhere = buildCursorWhere(cursor, parsed.direction);
  const baseWhere = buildAuditEventWhere(parsed);
  const where = cursorWhere ? { AND: [baseWhere, cursorWhere] } : baseWhere;
  const orderBy = buildOrderBy(parsed.direction);
  const limit = parsed.limit;

  const records = await prisma.auditEvent.findMany({
    where,
    orderBy,
    take: limit + 1
  });

  const pageInfo = buildPageInfo(records, limit, parsed.direction);

  return {
    items: pageInfo.results,
    pageInfo: {
      nextCursor: pageInfo.nextCursor,
      prevCursor: pageInfo.prevCursor,
      hasNext: parsed.direction === "next" ? pageInfo.hasMore : pageInfo.hasMore,
      hasPrev: parsed.direction === "prev" ? pageInfo.hasMore : pageInfo.hasMore
    }
  };
}

export async function fetchAuditEventById(eventId) {
  return prisma.auditEvent.findUnique({
    where: { id: Number(eventId) }
  });
}
