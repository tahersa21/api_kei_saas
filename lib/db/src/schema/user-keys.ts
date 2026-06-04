import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userKeysTable = pgTable("user_keys", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id"),
  label: text("label").notNull(),
  key: text("key").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserKeySchema = createInsertSchema(userKeysTable).omit({
  usageCount: true,
  lastUsedAt: true,
  createdAt: true,
});

export type InsertUserKey = z.infer<typeof insertUserKeySchema>;
export type UserKey = typeof userKeysTable.$inferSelect;
