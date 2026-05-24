import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ragDocumentsTable = pgTable("rag_documents", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRagDocumentSchema = createInsertSchema(ragDocumentsTable).omit({ id: true, createdAt: true });
export type InsertRagDocument = z.infer<typeof insertRagDocumentSchema>;
export type RagDocumentRow = typeof ragDocumentsTable.$inferSelect;
