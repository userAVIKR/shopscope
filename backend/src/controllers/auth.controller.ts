import type { CookieOptions, Request, RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { currentUser, readSessionToken } from "../middleware/auth.middleware.js";
import * as authService from "../services/auth.service.js";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address" }).max(254));

const registerSchema = z.object({
  email,
  name: z.string().trim().min(1, "Name is required").max(100),
  // The upper bound stops very long inputs from making hashing expensive.
  password: z.string().min(10, "Password must be at least 10 characters").max(128),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
});

const cookieOptions: CookieOptions = {
  httpOnly: true, // page scripts cannot read it
  secure: env.NODE_ENV === "production", // HTTPS only once deployed
  sameSite: "lax", // not sent with cross-site POSTs, which blocks CSRF
  path: "/",
};

const requestContext = (req: Request): authService.RequestContext => ({ ip: req.ip, userAgent: req.get("user-agent") });

export const register: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const { user, token, expiresAt } = await authService.register(input, requestContext(req));
  res.cookie(authService.SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
  res.status(201).json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const { user, token, expiresAt } = await authService.login(input, requestContext(req));
  res.cookie(authService.SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
  res.json({ user });
};

export const logout: RequestHandler = async (req, res) => {
  const token = readSessionToken(req);
  if (token) await authService.logout(token, requestContext(req));
  res.clearCookie(authService.SESSION_COOKIE, cookieOptions);
  res.status(204).end();
};

export const me: RequestHandler = (req, res) => {
  res.json({ user: currentUser(req) });
};
