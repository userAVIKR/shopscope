import { createApp } from "./app.js";
import { closeDatabases } from "./config/database.js";
import { env } from "./config/env.js";

const server = createApp().listen(env.PORT, () => {
  console.log(`ShopScope API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
  process.exit(1);
});

// Finish in-flight requests and release database connections before exiting.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await closeDatabases();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
