import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ragChunksTable = pgTable("rag_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  embedding: text("embedding").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRagChunkSchema = createInsertSchema(ragChunksTable).omit({ id: true, createdAt: true });
export type InsertRagChunk = z.infer<typeof insertRagChunkSchema>;
export type RagChunkRow = typeof ragChunksTable.$inferSelect;
