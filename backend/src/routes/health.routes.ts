import { Router } from "express";
import { checkModel, modelInfo } from "../ai/model.js";
import { pingAnalyticsDatabase, pingAppDatabase } from "../config/database.js";

export const healthRouter = Router();

// 200 when every dependency is ready, 503 otherwise, so scripts can rely on the status code.
healthRouter.get("/", async (_req, res) => {
  const [appDatabase, analyticsDatabase, aiModel] = await Promise.all([
    pingAppDatabase(),
    pingAnalyticsDatabase(),
    checkModel(),
  ]);
  const ok = appDatabase && analyticsDatabase && aiModel === "up";

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      appDatabase: appDatabase ? "up" : "down",
      analyticsDatabase: analyticsDatabase ? "up" : "down",
      aiModel,
    },
    // Which AI writes the SQL. Never includes the API key.
    ai: modelInfo,
  });
});
