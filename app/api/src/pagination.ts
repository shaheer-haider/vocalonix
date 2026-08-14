export const DEFAULT_LIST_LIMIT = 200;
export const MAX_LIST_LIMIT = 500;

export interface ListQuery {
  limit: number;
  offset: number;
}

function parseCount(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function parseListQuery(query: {
  limit?: unknown;
  offset?: unknown;
}): ListQuery {
  const limit = Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, parseCount(query.limit, DEFAULT_LIST_LIMIT)),
  );
  const offset = Math.max(0, parseCount(query.offset, 0));
  return { limit, offset };
}

export function paginate<T>(
  rows: T[],
  limit: number,
): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}
