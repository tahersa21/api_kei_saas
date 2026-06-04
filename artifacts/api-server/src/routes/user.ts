import { Router } from "express";
import { db, userKeysTable, requestLogsTable } from "@workspace/db";
import { eq, desc, count, sql, and, gte, lte, like } from "drizzle-orm";

const router = Router();

async function resolveKey(apiKey: string | undefined) {
  if (!apiKey) return null;
  const [k] = await db.select().from(userKeysTable).where(eq(userKeysTable.key, apiKey.trim())).limit(1);
  return k && k.isActive ? k : null;
}

function dateRange(range: string | undefined) {
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  if (range === "7d") { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
  else if (range === "30d") { start.setDate(now.getDate() - 30); start.setHours(0, 0, 0, 0); }
  else { start.setHours(0, 0, 0, 0); }
  return { start, end };
}

// GET /api/user/stats?range=today|7d|30d
router.get("/user/stats", async (req, res) => {
  const apiKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  const userKey = await resolveKey(apiKey);
  if (!userKey) { res.status(401).json({ error: "Invalid or inactive API key" }); return; }

  const { start, end } = dateRange(req.query.range as string | undefined);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [totalResult, rangeResult, todayResult, topModels, recentLogs] = await Promise.all([
    db.select({ c: count() }).from(requestLogsTable).where(eq(requestLogsTable.userKeyId, userKey.id)),
    db.select({ c: count() }).from(requestLogsTable).where(
      sql`${requestLogsTable.userKeyId} = ${userKey.id} AND ${requestLogsTable.createdAt} >= ${start} AND ${requestLogsTable.createdAt} <= ${end}`
    ),
    db.select({ c: count() }).from(requestLogsTable).where(
      sql`${requestLogsTable.userKeyId} = ${userKey.id} AND ${requestLogsTable.createdAt} >= ${todayStart}`
    ),
    db.select({ model: requestLogsTable.model, c: count() })
      .from(requestLogsTable)
      .where(sql`${requestLogsTable.userKeyId} = ${userKey.id} AND ${requestLogsTable.createdAt} >= ${start}`)
      .groupBy(requestLogsTable.model)
      .orderBy(desc(count()))
      .limit(10),
    db.select({ model: requestLogsTable.model, status: requestLogsTable.status, elapsedMs: requestLogsTable.elapsedMs, createdAt: requestLogsTable.createdAt })
      .from(requestLogsTable)
      .where(eq(requestLogsTable.userKeyId, userKey.id))
      .orderBy(desc(requestLogsTable.createdAt))
      .limit(10),
  ]);

  res.json({
    totalRequests: Number(totalResult[0]?.c ?? 0),
    rangeRequests: Number(rangeResult[0]?.c ?? 0),
    todayRequests: Number(todayResult[0]?.c ?? 0),
    topModels: topModels.map(r => ({ model: r.model, count: Number(r.c) })),
    recentLogs,
    keyLabel: userKey.label,
    keyMasked: userKey.key.slice(0, 7) + "***" + userKey.key.slice(-4),
    keyActive: userKey.isActive,
    keyCreatedAt: userKey.createdAt,
  });
});

// GET /api/user/logs?page=1&pageSize=20&model=&status=&range=today|7d|30d
router.get("/user/logs", async (req, res) => {
  const apiKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  const userKey = await resolveKey(apiKey);
  if (!userKey) { res.status(401).json({ error: "Invalid or inactive API key" }); return; }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"))));
  const modelFilter = (req.query.model as string | undefined)?.trim();
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const { start, end } = dateRange(req.query.range as string | undefined);

  const conditions = [
    eq(requestLogsTable.userKeyId, userKey.id),
    gte(requestLogsTable.createdAt, start),
    lte(requestLogsTable.createdAt, end),
    ...(modelFilter ? [like(requestLogsTable.model, `%${modelFilter}%`)] : []),
    ...(statusFilter ? [eq(requestLogsTable.status, statusFilter)] : []),
  ];

  const [totalRes, rows] = await Promise.all([
    db.select({ c: count() }).from(requestLogsTable).where(and(...conditions)),
    db.select({
      id: requestLogsTable.id,
      model: requestLogsTable.model,
      status: requestLogsTable.status,
      elapsedMs: requestLogsTable.elapsedMs,
      createdAt: requestLogsTable.createdAt,
    })
      .from(requestLogsTable)
      .where(and(...conditions))
      .orderBy(desc(requestLogsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  res.json({ total: Number(totalRes[0]?.c ?? 0), page, pageSize, logs: rows });
});

export default router;
