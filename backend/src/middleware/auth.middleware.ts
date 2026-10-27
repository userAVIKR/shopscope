import type { Request, RequestHandler } from "express";
import { getUserBySessionToken, SESSION_COOKIE } from "../services/auth.service.js";
import { HttpError } from "../utils/http-error.js";

export function readSessionToken(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

// Protects a route: only requests with a valid, unexpired session cookie get through.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  const user = token ? await getUserBySessionToken(token) : null;

  if (!user) {
    if (token) res.clearCookie(SESSION_COOKIE, { path: "/" });
    throw new HttpError(401, "UNAUTHENTICATED", "Please log in to continue");
  }

  req.user = user;
  next();
};

// For handlers behind requireAuth: returns the user, or fails loudly if the middleware was forgotten.
export function currentUser(req: Request) {
  if (!req.user) throw new Error("currentUser() used on a route without requireAuth");
  return req.user;
}
