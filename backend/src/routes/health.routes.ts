import { Router } from "express";
import { checkOllama } from "../ai/ollama.provider.js";
import { pingAnalyticsDatabase, pingAppDatabase } from "../config/database.js";

export const healthRouter = Router();

// 200 when every dependency is ready, 503 otherwise, so scripts can rely on the status code.
healthRouter.get("/", async (_req, res) => {
  const [appDatabase, analyticsDatabase, ollama] = await Promise.all([
    pingAppDatabase(),
    pingAnalyticsDatabase(),
    checkOllama(),
  ]);
  const ok = appDatabase && analyticsDatabase && ollama === "up";

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      appDatabase: appDatabase ? "up" : "down",
      analyticsDatabase: analyticsDatabase ? "up" : "down",
      ollama,
    },
  });
});
