import { Router } from "express";
import { db, userKeysTable, requestLogsTable } from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";

const router = Router();

router.get("/user/stats", async (req, res) => {
  const apiKey = (req.headers["x-api-key"] as string | undefined)?.trim();
  if (!apiKey) {
    res.status(401).json({ error: "Missing X-Api-Key header" });
    return;
  }

  const [userKey] = await db
    .select()
    .from(userKeysTable)
    .where(eq(userKeysTable.key, apiKey))
    .limit(1);

  if (!userKey || !userKey.isActive) {
    res.status(401).json({ error: "Invalid or inactive API key" });
    return;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [totalResult, todayResult, weekResult, topModels, recentLogs] = await Promise.all([
    db.select({ c: count() }).from(requestLogsTable).where(eq(requestLogsTable.userKeyId, userKey.id)),
    db.select({ c: count() }).from(requestLogsTable).where(
      sql`${requestLogsTable.userKeyId} = ${userKey.id} AND ${requestLogsTable.createdAt} >= ${todayStart}`
    ),
    db.select({ c: count() }).from(requestLogsTable).where(
      sql`${requestLogsTable.userKeyId} = ${userKey.id} AND ${requestLogsTable.createdAt} >= ${weekStart}`
    ),
    db
      .select({ model: requestLogsTable.model, count: count() })
      .from(requestLogsTable)
      .where(eq(requestLogsTable.userKeyId, userKey.id))
      .groupBy(requestLogsTable.model)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({
        model: requestLogsTable.model,
        status: requestLogsTable.status,
        elapsedMs: requestLogsTable.elapsedMs,
        createdAt: requestLogsTable.createdAt,
      })
      .from(requestLogsTable)
      .where(eq(requestLogsTable.userKeyId, userKey.id))
      .orderBy(desc(requestLogsTable.createdAt))
      .limit(10),
  ]);

  res.json({
    totalRequests: Number(totalResult[0]?.c ?? 0),
    requestsToday: Number(todayResult[0]?.c ?? 0),
    requestsWeek: Number(weekResult[0]?.c ?? 0),
    topModels: topModels.map(r => ({ model: r.model, count: Number(r.count) })),
    recentLogs,
  });
});

export default router;
