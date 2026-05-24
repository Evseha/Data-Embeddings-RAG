import { db, ragChunksTable, ragDocumentsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

export interface ChunkVector {
  id: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  text: string;
  vector: number[];
}

let store: ChunkVector[] = [];

export async function loadVectorStore(): Promise<void> {
  try {
    const chunks = await db.select().from(ragChunksTable);
    const docs = await db.select().from(ragDocumentsTable);
    const docMap = new Map(docs.map((d) => [d.id, d.filename]));

    store = chunks.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      documentName: docMap.get(c.documentId) ?? "unknown",
      chunkIndex: c.chunkIndex,
      text: c.text,
      vector: JSON.parse(c.embedding) as number[],
    }));

    logger.info({ count: store.length }, "Vector store loaded");
  } catch (err) {
    logger.error({ err }, "Failed to load vector store");
  }
}

export function addChunkVector(chunk: ChunkVector): void {
  store.push(chunk);
}

export function removeChunksByDocumentId(documentId: number): void {
  store = store.filter((c) => c.documentId !== documentId);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface ScoredChunk {
  id: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  text: string;
  similarity: number;
}

export function retrieveTopK(queryVector: number[], k = 5): ScoredChunk[] {
  if (store.length === 0) return [];

  const scored = store.map((chunk) => ({
    id: chunk.id,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    similarity: cosineSimilarity(queryVector, chunk.vector),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}
