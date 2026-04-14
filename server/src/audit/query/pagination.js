const CURSOR_VERSION = "audit-log-v1";

export function encodeAuditCursor(cursor) {
  const payload = { version: CURSOR_VERSION, ...cursor };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodeAuditCursor(value) {
  if (!value) return null;
  try {
    const data = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    if (data.version !== CURSOR_VERSION) return null;
    if (!data.createdAt || data.id === undefined) return null;
    return { createdAt: new Date(data.createdAt), id: Number(data.id) };
  } catch {
    return null;
  }
}

export function buildCursorWhere(cursor, direction) {
  if (!cursor) return undefined;
  if (direction === "prev") {
    return {
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { gt: cursor.id }
        }
      ]
    };
  }

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      {
        createdAt: cursor.createdAt,
        id: { lt: cursor.id }
      }
    ]
  };
}

export function buildOrderBy(direction) {
  if (direction === "prev") {
    return [
      { createdAt: "asc" },
      { id: "asc" }
    ];
  }

  return [
    { createdAt: "desc" },
    { id: "desc" }
  ];
}

export function normalizeResults(results, direction) {
  if (direction === "prev") {
    return [...results].reverse();
  }
  return results;
}

export function buildPageInfo(results, limit, direction) {
  const hasMore = results.length > limit;
  const safeResults = hasMore ? results.slice(0, limit) : results;
  const normalized = normalizeResults(safeResults, direction);

  const first = normalized[0];
  const last = normalized[normalized.length - 1];

  return {
    results: normalized,
    hasMore,
    nextCursor: last ? encodeAuditCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    prevCursor: first ? encodeAuditCursor({ createdAt: first.createdAt.toISOString(), id: first.id }) : null
  };
}
