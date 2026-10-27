import { createHmac, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { recordAuditEvent } from "./audit.service.js";

export const SESSION_COOKIE = "shopscope_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PublicUser = { id: string; email: string; name: string; createdAt: Date };
export type RequestContext = { ip?: string | undefined; userAgent?: string | undefined };
type NewSession = { user: PublicUser; token: string; expiresAt: Date };

const toPublicUser = ({ id, email, name, createdAt }: PublicUser): PublicUser => ({ id, email, name, createdAt });

// The database stores only this keyed hash, never the token itself.
const hashToken = (token: string) => createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");

// Verifying against a dummy hash for unknown emails makes both failure paths take the same time,
// so response timing does not reveal which emails have accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash(randomBytes(32).toString("hex")));

async function createSession(userId: string, context: RequestContext) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt, userAgent: context.userAgent?.slice(0, 500) ?? null },
  });
  return { token, expiresAt };
}

export async function register(
  input: { email: string; name: string; password: string },
  context: RequestContext,
): Promise<NewSession> {
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  let user;
  try {
    user = await prisma.user.create({ data: { email: input.email, name: input.name, passwordHash } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  }

  const session = await createSession(user.id, context);
  await recordAuditEvent("auth.register", { userId: user.id, ip: context.ip });
  return { user: toPublicUser(user), ...session };
}

export async function login(input: { email: string; password: string }, context: RequestContext): Promise<NewSession> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const passwordMatches = await argon2.verify(user?.passwordHash ?? (await getDummyHash()), input.password);

  if (!user || !passwordMatches) {
    await recordAuditEvent("auth.login.failed", { userId: user?.id, ip: context.ip, metadata: { email: input.email } });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  await prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  const session = await createSession(user.id, context);
  await recordAuditEvent("auth.login.succeeded", { userId: user.id, ip: context.ip });
  return { user: toPublicUser(user), ...session };
}

export async function getUserBySessionToken(token: string): Promise<PublicUser | null> {
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return toPublicUser(session.user);
}

export async function logout(token: string, context: RequestContext): Promise<void> {
  const session = await prisma.session.findUnique({ where: { id: hashToken(token) } });
  if (!session) return;

  await prisma.session.deleteMany({ where: { id: session.id } });
  await recordAuditEvent("auth.logout", { userId: session.userId, ip: context.ip });
}
