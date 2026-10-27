import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { prisma } from "../../src/config/database.js";

// Unique per test file, because test files run in parallel and each deletes only its own users.
export const TEST_EMAIL_DOMAIN = `@${randomUUID().slice(0, 8)}.shopscope.test`;
export const TEST_PASSWORD = "correct horse battery";

// Registers a throwaway user and returns the Cookie header value for their session.
export async function createTestUser(app: Express, name = "Test User") {
  const email = `user-${randomUUID()}${TEST_EMAIL_DOMAIN}`;
  const res = await request(app).post("/api/v1/auth/register").send({ email, name, password: TEST_PASSWORD });
  if (res.status !== 201) throw new Error(`Registration failed: ${res.status} ${JSON.stringify(res.body)}`);

  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const cookie = cookies.find((c) => c.startsWith("shopscope_session="))!.split(";")[0]!;
  return { id: res.body.user.id as string, email, cookie };
}

export async function deleteTestUsers() {
  await prisma.auditEvent.deleteMany({ where: { metadata: { path: ["email"], string_ends_with: TEST_EMAIL_DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } });
}
