import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rcKeysTable = pgTable("rc_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  key: text("key").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isValid: boolean("is_valid").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRcKeySchema = createInsertSchema(rcKeysTable).omit({
  usageCount: true,
  lastUsedAt: true,
  lastCheckedAt: true,
  createdAt: true,
});

export type InsertRcKey = z.infer<typeof insertRcKeySchema>;
export type RcKey = typeof rcKeysTable.$inferSelect;
