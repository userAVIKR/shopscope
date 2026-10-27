import { Router } from "express";
import * as queries from "../controllers/query.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createQueryRateLimiter } from "../middleware/rate-limit.middleware.js";

export function createQueryRouter() {
  const router = Router();
  router.post("/", requireAuth, createQueryRateLimiter(), queries.ask);
  return router;
}
