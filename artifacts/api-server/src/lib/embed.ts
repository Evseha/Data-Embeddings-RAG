import { logger } from "./logger.js";

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

type Extractor = (text: string, opts: object) => Promise<{ data: Float32Array }>;

let extractor: Extractor | null = null;
let modelReady = false;
let loadingPromise: Promise<void> | null = null;

export function isModelReady(): boolean {
  return modelReady;
}

export async function initEmbedModel(): Promise<void> {
  if (modelReady) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      logger.info({ model: MODEL_NAME }, "Loading embedding model...");
      const { pipeline } = await import("@huggingface/transformers");
      const pipe = await pipeline("feature-extraction", MODEL_NAME);
      extractor = pipe as unknown as Extractor;
      modelReady = true;
      logger.info({ model: MODEL_NAME }, "Embedding model loaded successfully");
    } catch (err) {
      logger.error({ err }, "Failed to load embedding model");
      loadingPromise = null;
      throw err;
    }
  })();

  return loadingPromise;
}

export async function embed(text: string): Promise<number[]> {
  if (!extractor) {
    throw new Error("Embedding model not initialized");
  }
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}
