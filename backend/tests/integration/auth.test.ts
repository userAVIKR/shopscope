// Requires the database: npm run db:up && npm run db:migrate
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { closeDatabases, prisma } from "../../src/config/database.js";

const TEST_DOMAIN = "@shopscope.test";
const PASSWORD = "correct horse battery";

const uniqueEmail = () => `user-${randomUUID()}${TEST_DOMAIN}`;

// Returns "shopscope_session=<token>" from a response, ready for a Cookie header.
function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  const cookie = cookies.find((c) => c.startsWith("shopscope_session="));
  if (!cookie) throw new Error("No session cookie in response");
  return cookie.split(";")[0]!;
}

let app: ReturnType<typeof createApp>;
// A fresh app per test gives every test its own rate-limit counters.
beforeEach(() => {
  app = createApp();
});

async function registerUser(email = uniqueEmail(), name = "Test User") {
  const res = await request(app).post("/api/v1/auth/register").send({ email, name, password: PASSWORD });
  expect(res.status).toBe(201);
  return { email, res, cookie: sessionCookie(res) };
}

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { metadata: { path: ["email"], string_ends_with: TEST_DOMAIN } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  await closeDatabases();
});

describe("POST /auth/register", () => {
  it("creates the user, logs them in and never returns the password hash", async () => {
    const { email, res } = await registerUser();

    expect(res.body.user).toMatchObject({ email, name: "Test User" });
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("stores an argon2id hash and only a hash of the session token", async () => {
    const { email, cookie } = await registerUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { sessions: true } });
    const token = cookie.split("=")[1]!;

    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0]!.id).not.toBe(token);
  });

  it("normalises email case and rejects duplicates", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: `  ${email.toUpperCase()} `, name: "Copy", password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it.each([
    ["invalid email", { email: "not-an-email", name: "A", password: PASSWORD }],
    ["short password", { email: uniqueEmail(), name: "A", password: "short" }],
    ["missing name", { email: uniqueEmail(), password: PASSWORD }],
    ["oversized password", { email: uniqueEmail(), name: "A", password: "x".repeat(129) }],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await request(app).post("/api/v1/auth/register").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /auth/login", () => {
  it("logs in with the right password", async () => {
    const { email } = await registerUser();
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    const me = await request(app).get("/api/v1/auth/me").set("Cookie", sessionCookie(res));
    expect(me.body.user.email).toBe(email);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const { email } = await registerUser();
    const wrongPassword = await request(app).post("/api/v1/auth/login").send({ email, password: "wrong password!" });
    const unknownEmail = await request(app).post("/api/v1/auth/login").send({ email: uniqueEmail(), password: PASSWORD });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" });
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("blocks an IP after 10 failed attempts, without counting successful logins", async () => {
    const { email } = await registerUser();
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD })).status).toBe(200);
    }
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post("/api/v1/auth/login").send({ email, password: "wrong password!" })).status).toBe(401);
    }

    const blocked = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});

describe("protected routes", () => {
  it("reject requests without a session cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("reject a made-up session token", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", `shopscope_session=${randomUUID()}`);
    expect(res.status).toBe(401);
  });

  it("reject an expired session", async () => {
    const { email, cookie } = await registerUser();
    await prisma.session.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get("/api/v1/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });

  it("identify each user only by their own session", async () => {
    const alice = await registerUser(uniqueEmail(), "Alice");
    const bob = await registerUser(uniqueEmail(), "Bob");

    const asAlice = await request(app).get("/api/v1/auth/me").set("Cookie", alice.cookie);
    const asBob = await request(app).get("/api/v1/auth/me").set("Cookie", bob.cookie);
    expect(asAlice.body.user).toMatchObject({ email: alice.email, name: "Alice" });
    expect(asBob.body.user).toMatchObject({ email: bob.email, name: "Bob" });
  });
});

describe("POST /auth/logout", () => {
  it("ends the session so the old cookie no longer works", async () => {
    const { cookie } = await registerUser();

    const res = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});

describe("audit log", () => {
  it("records register, failed login, successful login and logout", async () => {
    const { email, cookie } = await registerUser();
    await request(app).post("/api/v1/auth/login").send({ email, password: "wrong password!" });
    await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const events = await prisma.auditEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["auth.register", "auth.login.failed", "auth.login.succeeded", "auth.logout"]);
  });
});
