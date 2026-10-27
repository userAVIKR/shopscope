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
