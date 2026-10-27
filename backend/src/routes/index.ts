import { Router } from "express";
import { createAuthRouter } from "./auth.routes.js";
import { datasetRouter } from "./dataset.routes.js";
import { healthRouter } from "./health.routes.js";
import { historyRouter } from "./history.routes.js";
import { createQueryRouter } from "./query.routes.js";
import { reportRouter } from "./report.routes.js";

// Every route except /health and /auth must use requireAuth.
export function createApiRouter() {
  const router = Router();

  router.use("/health", healthRouter);
  router.use("/auth", createAuthRouter());
  router.use("/datasets", datasetRouter);
  router.use("/queries", createQueryRouter());
  router.use("/history", historyRouter);
  router.use("/reports", reportRouter);

  return router;
}
