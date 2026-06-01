import { pgTable, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type RoutingProviderEntry = {
  providerType: "cc" | "rc" | "ag" | "custom";
  providerId?: string;
  modelId: string;
  rpmLimit: number;
  priority: number;
};

export const routingRulesTable = pgTable("routing_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  providers: jsonb("providers").$type<RoutingProviderEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoutingRuleSchema = createInsertSchema(routingRulesTable).omit({
  createdAt: true,
});

export type InsertRoutingRule = z.infer<typeof insertRoutingRuleSchema>;
export type RoutingRule = typeof routingRulesTable.$inferSelect;
