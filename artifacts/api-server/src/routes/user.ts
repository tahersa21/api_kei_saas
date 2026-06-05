import { Router } from "express";
import { randomBytes } from "crypto";
import { getAuth } from "@clerk/express";
import { db, userKeysTable, requestLogsTable } from "@workspace/db";
import { eq, desc, count, sql, and, gte, lte, like, inArray } from "drizzle-orm";
import { getUserCredit, getUserTransactions } from "../lib/settings";

const router = Router();

// ── Auth helper ───────────────────────────────────────────────────────────────
function requireClerkUser(req: Parameters<typeof getAuth>[0], res: { status: (n: number) => { json: (o: object) => void } }): string | null {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  return userId;
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

function maskKey(key: string) {
  return key.slice(0, 7) + "***" + key.slice(-4);
}

// ── GET /api/user/keys ────────────────────────────────────────────────────────
router.get("/user/keys", async (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;
  const keys = await db
    .select()
    .from(userKeysTable)
    .where(eq(userKeysTable.clerkUserId, userId))
    .orderBy(desc(userKeysTable.createdAt));
  res.json({ keys: keys.map(k => ({ ...k, key: maskKey(k.key) })) });
});

// ── POST /api/user/keys ───────────────────────────────────────────────────────
router.post("/user/keys", async (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;

  const existing = await db
    .select({ c: count() })
    .from(userKeysTable)
    .where(eq(userKeysTable.clerkUserId, userId));

  const keyCount = Number(existing[0]?.c ?? 0);
  if (keyCount >= 5) {
    res.status(400).json({ error: "Maximum 5 API keys per account" });
    return;
  }

  const { label } = req.body as { label?: string };
  const id = randomBytes(12).toString("hex");
  const key = "sk-cc-" + randomBytes(24).toString("hex");
  const keyLabel = label?.trim() || `Key ${keyCount + 1}`;

  const [created] = await db
    .insert(userKeysTable)
    .values({ id, clerkUserId: userId, label: keyLabel, key })
    .returning();

  res.json({ key: { ...created, key: created.key } }); // return full key ONCE at creation
});

// ── DELETE /api/user/keys/:id ─────────────────────────────────────────────────
router.delete("/user/keys/:id", async (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;
  const [k] = await db.select().from(userKeysTable).where(eq(userKeysTable.id, req.params.id)).limit(1);
  if (!k || k.clerkUserId !== userId) { res.status(404).json({ error: "Key not found" }); return; }
  await db.delete(userKeysTable).where(eq(userKeysTable.id, req.params.id));
  res.json({ ok: true });
});

// ── PATCH /api/user/keys/:id/toggle ──────────────────────────────────────────
router.patch("/user/keys/:id/toggle", async (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;
  const [k] = await db.select().from(userKeysTable).where(eq(userKeysTable.id, req.params.id)).limit(1);
  if (!k || k.clerkUserId !== userId) { res.status(404).json({ error: "Key not found" }); return; }
  const [updated] = await db.update(userKeysTable).set({ isActive: !k.isActive }).where(eq(userKeysTable.id, req.params.id)).returning();
  res.json({ key: { ...updated, key: maskKey(updated.key) } });
});

// ── GET /api/user/stats?range=today|7d|30d ────────────────────────────────────
router.get("/user/stats", async (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;

  const userKeys = await db.select({ id: userKeysTable.id }).from(userKeysTable).where(eq(userKeysTable.clerkUserId, userId));
  const keyIds = userKeys.map(k => k.id);

  if (keyIds.length === 0) {
    res.json({ totalRequests: 0, rangeRequests: 0, todayRequests: 0, topModels: [], recentLogs: [] });
    return;
  }

  const { start, end } = dateRange(req.query.range as string | undefined);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [totalRes, rangeRes, todayRes, topModels, recentLogs] = await Promise.all([
    db.select({ c: count() }).from(requestLogsTable).where(inArray(requestLogsTable.userKeyId, keyIds)),
    db.select({ c: count() }).from(requestLogsTable).where(
      and(inArray(requestLogsTable.userKeyId, keyIds), gte(requestLogsTable.createdAt, start), lte(requestLogsTable.createdAt, end))
    ),
    db.select({ c: count() }).from(requestLogsTable).where(
      and(inArray(requestLogsTable.userKeyId, keyIds), gte(requestLogsTable.createdAt, todayStart))
    ),
    db.select({ model: requestLogsTable.model, c: count() })
      .from(requestLogsTable)
      .where(and(inArray(requestLogsTable.userKeyId, keyIds), gte(requestLogsTable.createdAt, start), lte(requestLogsTable.createdAt, end)))
      .groupBy(requestLogsTable.model)
      .orderBy(desc(count()))
      .limit(10),
    db.select({ model: requestLogsTable.model, status: requestLogsTable.status, elapsedMs: requestLogsTable.elapsedMs, createdAt: requestLogsTable.createdAt })
      .from(requestLogsTable)
      .where(inArray(requestLogsTable.userKeyId, keyIds))
      .orderBy(desc(requestLogsTable.createdAt))
      .limit(10),
  ]);

  res.json({
    totalRequests: Number(totalRes[0]?.c ?? 0),
    rangeRequests: Number(rangeRes[0]?.c ?? 0),
    todayRequests: Number(todayRes[0]?.c ?? 0),
    topModels: topModels.map(r => ({ model: r.model, count: Number(r.c) })),
    recentLogs,
  });
});

// ── GET /api/user/logs ────────────────────────────────────────────────────────
router.get("/user/logs", async (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;

  const userKeys = await db.select({ id: userKeysTable.id }).from(userKeysTable).where(eq(userKeysTable.clerkUserId, userId));
  const keyIds = userKeys.map(k => k.id);

  if (keyIds.length === 0) { res.json({ total: 0, page: 1, pageSize: 20, logs: [] }); return; }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"))));
  const modelFilter = (req.query.model as string | undefined)?.trim();
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const { start, end } = dateRange(req.query.range as string | undefined);

  const conditions = [
    inArray(requestLogsTable.userKeyId, keyIds),
    gte(requestLogsTable.createdAt, start),
    lte(requestLogsTable.createdAt, end),
    ...(modelFilter ? [like(requestLogsTable.model, `%${modelFilter}%`)] : []),
    ...(statusFilter ? [eq(requestLogsTable.status, statusFilter)] : []),
  ];

  const [totalRes, rows] = await Promise.all([
    db.select({ c: count() }).from(requestLogsTable).where(and(...conditions)),
    db.select({ id: requestLogsTable.id, model: requestLogsTable.model, status: requestLogsTable.status, elapsedMs: requestLogsTable.elapsedMs, createdAt: requestLogsTable.createdAt })
      .from(requestLogsTable).where(and(...conditions)).orderBy(desc(requestLogsTable.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
  ]);

  res.json({ total: Number(totalRes[0]?.c ?? 0), page, pageSize, logs: rows });
});

// ── GET /api/user/credits ─────────────────────────────────────────────────────
router.get("/user/credits", (req, res) => {
  const userId = requireClerkUser(req, res);
  if (!userId) return;
  res.json({
    balance: getUserCredit(userId),
    transactions: getUserTransactions(userId).slice(0, 10),
  });
});

export default router;
