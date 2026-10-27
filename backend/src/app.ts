import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Only the Next.js frontend may call the API from a browser. Credentials allow the session cookie.
  app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
