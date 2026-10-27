import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { createLoginRateLimiter, createRegisterRateLimiter } from "../middleware/rate-limit.middleware.js";

export function createAuthRouter() {
  const router = Router();

  router.post("/register", createRegisterRateLimiter(), auth.register);
  router.post("/login", createLoginRateLimiter(), auth.login);
  router.post("/logout", auth.logout);
  router.get("/me", requireAuth, auth.me);

  return router;
}
