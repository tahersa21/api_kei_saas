import { pgTable, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ProviderChannel = {
  prefix: string;
  apiType: "openai" | "openai-responses" | "anthropic" | "gemini";
  displayName: string;
  requiresCLIProtocol?: boolean;
};

export const providersTable = pgTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull().default("text"),
  baseUrl: text("base_url").notNull(),
  authMethod: text("auth_method").notNull().default("bearer"),
  additionalHeaders: jsonb("additional_headers").$type<Record<string, string>>().default({}),
  channels: jsonb("channels").$type<ProviderChannel[]>().notNull().default([]),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProviderSchema = createInsertSchema(providersTable).omit({
  createdAt: true,
});

export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providersTable.$inferSelect;
