import { rateLimit } from "express-rate-limit";
import { HttpError } from "../utils/http-error.js";

const tooManyAttempts = () => new HttpError(429, "TOO_MANY_REQUESTS", "Too many attempts. Please try again later.");

// Each call creates a limiter with its own counters, so every app instance starts fresh.

// Slows password guessing: 10 failed logins per IP per 15 minutes. Successful logins are not counted.
export const createLoginRateLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyAttempts()),
  });

// Limits account creation: 5 per IP per hour.
export const createRegisterRateLimiter = () =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(tooManyAttempts()),
  });

// Each question runs the local model, so limit how fast one user can ask: 20 per minute.
// Must come after requireAuth: the limit is per user, not per IP.
export const createQueryRateLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user?.id ?? "anonymous",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, "TOO_MANY_REQUESTS", "You are asking questions too quickly. Please wait a moment.")),
  });
