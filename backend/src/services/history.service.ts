import { prisma } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";

const historySelect = {
  id: true,
  datasetId: true,
  question: true,
  generatedSql: true,
  explanation: true,
  status: true,
  repaired: true,
  errorCode: true,
  errorMessage: true,
  rowCount: true,
  durationMs: true,
  model: true,
  createdAt: true,
} as const;

// Newest first, keyset-paginated: pass the last item's id as `cursor` to get the next page.
export async function listHistory(userId: string, options: { limit: number; cursor?: string | undefined }) {
  const items = await prisma.queryHistory.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: historySelect,
  });

  const hasMore = items.length > options.limit;
  const page = hasMore ? items.slice(0, options.limit) : items;
  return { items: page, nextCursor: hasMore ? page.at(-1)!.id : null };
}

// Another user's record gives the same 404 as a missing one, so ids cannot be probed.
export async function getHistoryItem(userId: string, id: string) {
  const item = await prisma.queryHistory.findFirst({ where: { id, userId }, select: historySelect });
  if (!item) throw new HttpError(404, "HISTORY_NOT_FOUND", "Query not found");
  return item;
}
