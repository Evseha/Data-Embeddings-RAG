import { Router, type IRouter } from "express";
import multer from "multer";
import { db, ragDocumentsTable, ragChunksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { chunkText } from "../../lib/chunker.js";
import { embed, isModelReady } from "../../lib/embed.js";
import {
  addChunkVector,
  removeChunksByDocumentId,
  retrieveTopK,
  getStore,
} from "../../lib/vectorStore.js";
import { extractKeywords, bm25Search } from "../../lib/bm25.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/rag/stats", async (_req, res): Promise<void> => {
  const docs = await db.select().from(ragDocumentsTable);
  const chunks = await db.select().from(ragChunksTable);
  res.json({
    documentCount: docs.length,
    chunkCount: chunks.length,
    isModelReady: isModelReady(),
  });
});

router.get("/rag/documents", async (_req, res): Promise<void> => {
  const docs = await db
    .select()
    .from(ragDocumentsTable)
    .orderBy(ragDocumentsTable.createdAt);
  res.json(docs);
});

router.post("/rag/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }

  if (!isModelReady()) {
    res.status(503).json({ error: "Embedding model is still loading, please wait" });
    return;
  }

  const filename = req.file.originalname;
  const content = req.file.buffer.toString("utf-8");
  const chunks = chunkText(content);

  if (chunks.length === 0) {
    res.status(400).json({ error: "File appears to be empty" });
    return;
  }

  const [doc] = await db
    .insert(ragDocumentsTable)
    .values({ filename, chunkCount: chunks.length })
    .returning();

  const chunkRows = [];
  for (let i = 0; i < chunks.length; i++) {
    const vector = await embed(chunks[i]);
    const [row] = await db
      .insert(ragChunksTable)
      .values({
        documentId: doc.id,
        chunkIndex: i,
        text: chunks[i],
        embedding: JSON.stringify(vector),
      })
      .returning();

    addChunkVector({
      id: row.id,
      documentId: doc.id,
      documentName: filename,
      chunkIndex: i,
      text: chunks[i],
      vector,
    });

    chunkRows.push(row);
  }

  res.status(201).json(doc);
});

router.delete("/rag/documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [doc] = await db
    .select()
    .from(ragDocumentsTable)
    .where(eq(ragDocumentsTable.id, id));

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  await db.delete(ragChunksTable).where(eq(ragChunksTable.documentId, id));
  await db.delete(ragDocumentsTable).where(eq(ragDocumentsTable.id, id));
  removeChunksByDocumentId(id);

  res.sendStatus(204);
});

const SIMILARITY_THRESHOLD = 0.40;

router.post("/rag/retrieve", async (req, res): Promise<void> => {
  const { question } = req.body as { question?: string };
  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question is required" });
    return;
  }

  if (!isModelReady()) {
    res.status(503).json({ error: "Embedding model is still loading" });
    return;
  }

  const keywords = extractKeywords(question);

  const queryVector = await embed(question);
  const embeddingChunks = retrieveTopK(queryVector, 5);

  const store = getStore();
  const keywordChunks = bm25Search(
    store.map((c) => ({ id: c.id, documentId: c.documentId, documentName: c.documentName, chunkIndex: c.chunkIndex, text: c.text })),
    keywords,
    5
  );

  // Merge: embedding results get weight 0.7, BM25 normalised weight 0.3
  const maxBm25 = keywordChunks[0]?.bm25Score ?? 1;
  const seen = new Map<number, { id: number; text: string; similarity: number; bm25Score: number; chunkIndex: number; documentId: number; documentName: string; combinedScore: number }>();

  for (const c of embeddingChunks) {
    seen.set(c.id, { ...c, bm25Score: 0, combinedScore: c.similarity * 0.7 });
  }
  for (const c of keywordChunks) {
    const normalised = maxBm25 > 0 ? c.bm25Score / maxBm25 : 0;
    if (seen.has(c.id)) {
      const existing = seen.get(c.id)!;
      existing.bm25Score = c.bm25Score;
      existing.combinedScore += normalised * 0.3;
    } else {
      seen.set(c.id, { id: c.id, text: c.text, similarity: 0, bm25Score: c.bm25Score, chunkIndex: c.chunkIndex, documentId: c.documentId, documentName: c.documentName, combinedScore: normalised * 0.3 });
    }
  }

  const mergedChunks = [...seen.values()]
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 5);

  const maxSimilarity = embeddingChunks[0]?.similarity ?? 0;
  const belowThreshold = maxSimilarity < SIMILARITY_THRESHOLD;

  res.json({
    question,
    keywords,
    embeddingChunks: embeddingChunks.map((r) => ({ id: r.id, text: r.text, similarity: r.similarity, chunkIndex: r.chunkIndex, documentId: r.documentId, documentName: r.documentName })),
    keywordChunks: keywordChunks.map((r) => ({ id: r.id, text: r.text, bm25Score: r.bm25Score, chunkIndex: r.chunkIndex, documentId: r.documentId, documentName: r.documentName })),
    mergedChunks: mergedChunks.map((r) => ({ id: r.id, text: r.text, similarity: r.similarity, bm25Score: r.bm25Score, chunkIndex: r.chunkIndex, documentId: r.documentId, documentName: r.documentName })),
    belowThreshold,
  });
});

router.post("/rag/chat", async (req, res): Promise<void> => {
  const { question, chunks } = req.body as {
    question?: string;
    chunks?: Array<{ text: string; documentName: string; similarity: number }>;
  };

  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "question is required" });
    return;
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    res.status(400).json({ error: "chunks are required" });
    return;
  }

  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
    return;
  }

  const context = chunks
    .map((c, i) => `[Chunk ${i + 1} from "${c.documentName}" | similarity: ${c.similarity.toFixed(3)}]\n${c.text}`)
    .join("\n\n---\n\n");

  const prompt = `Ты AI-консультант по документации. Отвечай СТРОГО на основе предоставленного контекста.

ПРАВИЛА:
1. Используй ТОЛЬКО информацию из контекста ниже.
2. Если в контексте нет ответа на вопрос — ответь ТОЛЬКО этой фразой: "К сожалению, я не нашёл информацию по этому вопросу в базе знаний."
3. Не придумывай факты, не используй общие знания.
4. Отвечай на языке вопроса.

КОНТЕКСТ:
${context}

ВОПРОС:
${question}

ОТВЕТ:`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://replit.com",
        "X-Title": "RAG Chat",
      },
      body: JSON.stringify({
        models: [
          "nvidia/nemotron-nano-9b-v2:free",
          "liquid/lfm-2.5-1.2b-instruct:free",
          "meta-llama/llama-3.2-3b-instruct:free",
        ],
        route: "fallback",
        temperature: 0.2,
        max_tokens: 700,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (trimmed.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content = parsed?.choices?.[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
    res.end();
  }
});

export default router;
