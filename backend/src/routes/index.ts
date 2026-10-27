import { Router } from "express";
import { createAuthRouter } from "./auth.routes.js";
import { healthRouter } from "./health.routes.js";

// Every route except /health and /auth must use requireAuth.
export function createApiRouter() {
  const router = Router();

  router.use("/health", healthRouter);
  router.use("/auth", createAuthRouter());

  return router;
}
