// Creates the three local settings files from their .example templates, with random
// database passwords that match across files. Safe to re-run: existing files are never overwritten.
//
//   node scripts/setup-env.mjs
//
// Creates:  .env                (Docker: database passwords)
//           backend/.env        (API: database URLs, AI settings, session secret)
//           frontend/.env.local (web app: where the API is)

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = (p) => join(root, p);
const secret = (bytes = 18) => randomBytes(bytes).toString("base64url"); // URL-safe: goes inside connection URLs

function readEnv(file) {
  if (!existsSync(path(file))) return {};
  return Object.fromEntries(
    readFileSync(path(file), "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

// Reuse passwords from whichever file already exists, so the files always agree.
const rootEnv = readEnv(".env");
const backendEnv = readEnv("backend/.env");
const passwordIn = (url) => url?.match(/^postgresql:\/\/[^:]+:([^@]+)@/)?.[1];
const usable = (value) => (value && !value.startsWith("CHANGE_ME") ? value : undefined);

const pw = {
  postgres: usable(rootEnv.POSTGRES_PASSWORD) ?? secret(),
  app: usable(rootEnv.APP_DB_PASSWORD) ?? usable(passwordIn(backendEnv.APP_DATABASE_URL)) ?? secret(),
  owner: usable(rootEnv.ANALYTICS_OWNER_PASSWORD) ?? usable(passwordIn(backendEnv.ANALYTICS_ADMIN_DATABASE_URL)) ?? secret(),
  reader: usable(rootEnv.ANALYTICS_READER_PASSWORD) ?? usable(passwordIn(backendEnv.ANALYTICS_DATABASE_URL)) ?? secret(),
};

function create(target, template, fill) {
  if (existsSync(path(target))) {
    console.log(`  kept     ${target} (already exists)`);
    return;
  }
  writeFileSync(path(target), fill(readFileSync(path(template), "utf8")));
  console.log(`  created  ${target}`);
}

console.log("Setting up local environment files:");

create(".env", ".env.example", (text) =>
  text
    .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${pw.postgres}`)
    .replace(/^APP_DB_PASSWORD=.*$/m, `APP_DB_PASSWORD=${pw.app}`)
    .replace(/^ANALYTICS_OWNER_PASSWORD=.*$/m, `ANALYTICS_OWNER_PASSWORD=${pw.owner}`)
    .replace(/^ANALYTICS_READER_PASSWORD=.*$/m, `ANALYTICS_READER_PASSWORD=${pw.reader}`),
);

const port = readEnv(".env").POSTGRES_PORT ?? "5433";
create("backend/.env", "backend/.env.example", (text) =>
  text
    .replace(/shopscope_app_user:CHANGE_ME@/, `shopscope_app_user:${pw.app}@`)
    .replace(/shopscope_reader:CHANGE_ME@/, `shopscope_reader:${pw.reader}@`)
    .replace(/shopscope_analytics_owner:CHANGE_ME@/, `shopscope_analytics_owner:${pw.owner}@`)
    .replace(/@127\.0\.0\.1:\d+\//g, `@127.0.0.1:${port}/`)
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret(32)}`),
);

create("frontend/.env.local", "frontend/.env.example", (text) => text);

console.log("\nDone. Passwords are random and only stored in these git-ignored files.");
console.log("Next: choose an AI model (see README, step 4).");
