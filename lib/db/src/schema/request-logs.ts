import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { ccKeysTable } from "./cc-keys";
import { userKeysTable } from "./user-keys";

export const requestLogsTable = pgTable("request_logs", {
  id: text("id").primaryKey(),
  userKeyId: text("user_key_id").references(() => userKeysTable.id, { onDelete: "set null" }),
  ccKeyId: text("cc_key_id").references(() => ccKeysTable.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  elapsedMs: integer("elapsed_ms"),
  status: text("status").notNull().default("ok"),
  errorMsg: text("error_msg"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RequestLog = typeof requestLogsTable.$inferSelect;
