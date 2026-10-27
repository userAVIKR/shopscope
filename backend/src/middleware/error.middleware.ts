import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

// Every error response has the same shape: { error: { code, message, details? } }
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request is invalid", details: z.flattenError(error) } });
    return;
  }

  // Errors raised by express.json() carry a `type` and an HTTP status.
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } });
    return;
  }

  // Unknown error: log everything, reveal nothing.
  if (env.NODE_ENV !== "test") console.error(error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
