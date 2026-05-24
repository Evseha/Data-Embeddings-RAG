import app from "./app";
import { logger } from "./lib/logger";
import { initEmbedModel } from "./lib/embed.js";
import { loadVectorStore } from "./lib/vectorStore.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  loadVectorStore().catch((err) => logger.error({ err }, "Vector store load failed"));
  initEmbedModel().catch((err) => logger.error({ err }, "Embed model init failed"));
});
