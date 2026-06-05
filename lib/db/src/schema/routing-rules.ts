import { pgTable, text, boolean, jsonb, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type RoutingProviderEntry = {
  providerType: "cc" | "rc" | "ag" | "custom";
  providerId?: string;
  modelId: string;
  rpmLimit: number;
  priority: number;
  /** For custom providers: the actual API key to use (stored at rule-creation time) */
  apiKey?: string;
  /** For custom providers: optional base URL override (overrides provider default) */
  apiBaseUrl?: string;
};

export const routingRulesTable = pgTable("routing_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  providers: jsonb("providers").$type<RoutingProviderEntry[]>().notNull().default([]),
  priceInputPer1M: real("price_input_per1m"),   // USD per 1M input tokens (null = free/unset)
  priceOutputPer1M: real("price_output_per1m"),  // USD per 1M output tokens (null = free/unset)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoutingRuleSchema = createInsertSchema(routingRulesTable).omit({
  createdAt: true,
});

export type InsertRoutingRule = z.infer<typeof insertRoutingRuleSchema>;
export type RoutingRule = typeof routingRulesTable.$inferSelect;
