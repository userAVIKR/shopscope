import { Router } from "express";
import { pingAnalyticsDatabase } from "../config/database.js";

export const healthRouter = Router();

// 200 when every dependency is reachable, 503 otherwise, so scripts can rely on the status code.
healthRouter.get("/", async (_req, res) => {
  const analyticsDatabase = await pingAnalyticsDatabase();
  const ok = analyticsDatabase;

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      analyticsDatabase: analyticsDatabase ? "up" : "down",
    },
  });
});
