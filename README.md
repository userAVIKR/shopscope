# ShopScope

**Ask questions about an online store's sales in plain English and get a chart, a table and the exact SQL behind the answer.**

> *"Revenue by category this year"* → AI writes the SQL → the backend checks it is safe → a read-only database runs it → you see a bar chart, a sortable table and the query.

ShopScope comes with a fictional Indian online store (500 customers, 100 products, 5,000 orders from Oct 2024 to Sep 2026). Everything runs on your own computer for free. The AI can be a local model (Ollama, works offline) or Google Gemini (free API key).

---

## Contents

1. [What you need](#1-what-you-need)
2. [Get the code](#2-get-the-code)
3. [Create the settings files](#3-create-the-settings-files)
4. [Choose the AI model](#4-choose-the-ai-model)
5. [Start the database and backend](#5-start-the-database-and-backend)
6. [Start the frontend](#6-start-the-frontend)
7. [Use the app](#7-use-the-app)
8. [Daily use: start and stop](#daily-use-start-and-stop)
9. [Troubleshooting](#troubleshooting)
10. [How it works](#how-it-works)

---

## 1. What you need

Install these first. All are free.

| Tool | Version | Why | Download | Check it works |
|---|---|---|---|---|
| **Git** | any recent | Download the code | [git-scm.com](https://git-scm.com/downloads) | `git --version` |
| **Node.js** | **24 or newer** | Runs the backend and frontend | [nodejs.org](https://nodejs.org/) (choose the LTS/Current that is 24+) | `node --version` |
| **Docker Desktop** | any recent | Runs the PostgreSQL database | [docker.com](https://www.docker.com/products/docker-desktop/) | `docker compose version` |
| **Ollama** *(option A)* | any recent | Runs the AI model on your computer | [ollama.com/download](https://ollama.com/download) | `ollama --version` |
| **Gemini API key** *(option B)* | — | Uses Google's AI instead of a local model | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | — |

You need **either** Ollama **or** a Gemini key, not both. See [step 4](#4-choose-the-ai-model).

**Hardware:** 8 GB RAM is enough with Gemini. With Ollama, 16 GB RAM is recommended. A GPU (NVIDIA with 4 GB+) makes the local model much faster but is optional.

**Ports used:** `3000` (website), `4000` (API), `5433` (database), `11434` (Ollama). Make sure nothing else is using them.

> **Windows:** Docker Desktop needs WSL 2. The installer offers to set it up. Restart your computer after installing Docker.
> Open **Docker Desktop** once and wait until it says *"Engine running"* before continuing.

---

## 2. Get the code

```bash
git clone https://github.com/userAVIKR/shopscope.git
cd shopscope
```

---

## 3. Create the settings files

ShopScope needs three settings files with matching database passwords. One command creates them all with random, secure passwords:

```bash
node scripts/setup-env.mjs
```

You should see:

```
  created  .env
  created  backend/.env
  created  frontend/.env.local
```

These files are ignored by git, so your passwords and keys are never uploaded. Running the command again never overwrites them.

---

## 4. Choose the AI model

### Option A: Local model with Ollama (offline, private)

1. Install Ollama and make sure it is running (Windows/macOS: llama icon in the system tray or menu bar).
2. Download the model (about 2 GB):
   ```bash
   ollama pull qwen2.5-coder:3b
   ```
3. Nothing else to change. `backend/.env` already has `LLM_PROVIDER=ollama`.

### Option B: Google Gemini (faster on most laptops, needs internet)

1. Create a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (sign in, click **Create API key**). No credit card needed.
2. Open `backend/.env` and change these two lines:
   ```
   LLM_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   ```
3. Check the key works and see which models it can use (run this after `npm install` in step 5):
   ```bash
   cd backend
   npm run ai:models
   ```
   The default `GEMINI_MODEL=gemini-2.5-flash` should be marked `<- current`. If the list says it is missing, copy any **flash** model from the list into `GEMINI_MODEL`.

> Only the question and the table descriptions are sent to the AI, never your data rows or passwords. Free-tier prompts may be used by Google to improve its products.

You can switch between A and B at any time by changing `LLM_PROVIDER` and restarting the backend.

---

## 5. Start the database and backend

Open a terminal in the project folder:

```bash
cd backend
npm install          # installs packages and generates the database client
npm run db:up        # starts PostgreSQL in Docker (first time: downloads the image)
npm run db:deploy    # creates the app tables (users, history, reports)
npm run db:seed      # creates the store tables and fills them with demo data
npm run dev          # starts the API
```

What each step should print:

| Command | Expected output |
|---|---|
| `npm run db:up` | `Container shopscope-postgres Healthy` |
| `npm run db:deploy` | `All migrations have been successfully applied.` |
| `npm run db:seed` | A table with 500 customers, 5000 orders, and `Revenue (excl. cancelled): ₹1,89,81,675` |
| `npm run dev` | `ShopScope API listening on http://localhost:4000/api/v1` |

Leave this terminal running.

**Check the backend:** open [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health). You should see something like:

```json
{"status":"ok","checks":{"appDatabase":"up","analyticsDatabase":"up","aiModel":"up"},"ai":{"provider":"ollama","model":"qwen2.5-coder:3b"}}
```

If anything says `down`, see [Troubleshooting](#troubleshooting).

---

## 6. Start the frontend

Open a **second** terminal in the project folder:

```bash
cd frontend
npm install
npm run dev
```

Wait for `Ready` and leave it running.

---

## 7. Use the app

1. Open [http://localhost:3000](http://localhost:3000).
2. Click **Create account**, enter a name, email and a password (10+ characters).
3. Ask a question, or click one of the suggestions. For example:
   - *What was the total revenue last month?*
   - *Revenue by category this year*
   - *Monthly order count over the last 12 months*
   - *Which cities have the most customers?*
   - *What percentage of orders in 2025 were cancelled?*
4. Switch between **Chart view** and **Table view**, open **Generated SQL**, or click **Save as report**.
5. The **History** and **Reports** pages keep your past questions and saved reports.

The first question can take a few seconds while the AI model loads.

**About the data:** orders run from **1 Oct 2024 to 30 Sep 2026**. Questions about later dates return no rows. "Revenue" means quantity × price paid, in ₹, and **excludes cancelled orders**. Customer names are hidden on purpose.

---

## Daily use: start and stop

**Start** (Docker Desktop and, for option A, Ollama must be running):

```bash
# terminal 1
cd backend
npm run db:up
npm run dev

# terminal 2
cd frontend
npm run dev
```

**Stop:** press `Ctrl + C` in both terminals. To stop the database too: `cd backend && npm run db:down` (your data is kept).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run db:up` fails with *"Cannot connect to the Docker daemon"* or *"pipe/dockerDesktopLinuxEngine"* | Docker Desktop is not running. Open it and wait for *"Engine running"*. |
| `port is already allocated` for **5433** | Another program uses port 5433. Change `POSTGRES_PORT` in `.env` **and** the three `:5433` in `backend/.env` to a free port (for example 5434), then `npm run db:up` again. |
| `EADDRINUSE` for **3000** or **4000** | ShopScope is already running in another terminal, or another app uses the port. Close it and try again. |
| Backend stops with *"Invalid environment configuration"* | A setting in `backend/.env` is missing or wrong; the message names it. If unsure, delete `backend/.env` and run `node scripts/setup-env.mjs` again (it reuses the database passwords from `.env`). |
| `/health` shows `"appDatabase":"down"` or `"analyticsDatabase":"down"` | Run `npm run db:up` in `backend`. |
| `password authentication failed` | The passwords in `.env` and `backend/.env` don't match the database. The database keeps the passwords it was **first** created with. Reset it (see below). |
| `/health` shows `"aiModel":"down"` with Ollama | Start Ollama (open it from the Start menu / Applications). |
| `"aiModel":"model_missing"` with Ollama | Run `ollama pull qwen2.5-coder:3b`. |
| `"aiModel":"invalid_key"` with Gemini | Check `GEMINI_API_KEY` in `backend/.env`, then restart the backend. |
| `"aiModel":"model_missing"` with Gemini | Run `npm run ai:models` and copy an available flash model into `GEMINI_MODEL`. |
| *"The AI service's free limit was reached"* | Gemini's free tier allows a limited number of requests per minute. Wait a minute. |
| The page says *"Server unreachable"* | The backend isn't running. Start it (step 5). |
| Changes to `backend/.env` have no effect | The backend reads `.env` only at startup. Press `Ctrl + C` and run `npm run dev` again. |

**Reset the database completely** (deletes all accounts, history and reports, then rebuilds everything):

```bash
cd backend
npm run db:wipe
npm run db:up
npm run db:deploy
npm run db:seed
```

---

## How it works

```
 Browser (Next.js, :3000)
        │  question
        ▼
 Express API (:4000) ──► AI model (Ollama :11434 or Gemini API)
        │                    returns a SQL proposal (never trusted)
        ▼
 SQL safety checks: PostgreSQL's own parser + allow-list of tables, columns and functions
        │  only a single, approved SELECT gets through
        ▼
 PostgreSQL (Docker, :5433)
   ├─ shopscope_app        users, sessions, history, reports   (Prisma)
   └─ shopscope_analytics  the store data, read-only user      (pg)
```

**Four layers of protection** stop the AI from ever changing data:

1. The AI is told to refuse anything that isn't a read-only question.
2. The validator only allows one `SELECT` that uses approved tables, columns and functions.
3. The query runs in a read-only transaction with a 5-second timeout and a 1,000-row limit.
4. The database user can only read, and cannot see hidden columns such as customer names.

If the AI's SQL fails a check, it gets one chance to fix it, and the fix is checked again.

### Tech stack

| Part | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, CSS Modules, Recharts |
| Backend | Node.js, Express 5, TypeScript, Zod |
| Database | PostgreSQL 17 (Docker), Prisma 7 (app data), `pg` (store data) |
| SQL safety | `libpg-query` (PostgreSQL's real parser) |
| AI | Ollama `qwen2.5-coder:3b` or Google Gemini `gemini-2.5-flash` |
| Auth | Email + password, argon2 hashing, httpOnly session cookies |
| Tests | Vitest, Supertest, Playwright |

### Project structure

```
shopscope/
├── docker-compose.yml          PostgreSQL container
├── scripts/setup-env.mjs       creates the settings files
├── backend/
│   ├── database/               store schema, demo data, database setup script
│   ├── prisma/                 app database models and migrations
│   ├── src/
│   │   ├── ai/                 prompts, Ollama and Gemini connectors
│   │   ├── analytics/          approved tables, columns and metric definitions
│   │   ├── sql/                parser, validator, read-only executor, result formatter
│   │   ├── routes/ controllers/ services/ middleware/
│   │   └── server.ts
│   └── tests/                  unit, integration, security and AI tests
└── frontend/
    └── src/
        ├── app/                pages: dashboard, login, history, reports
        ├── components/         layout, question box, chart, table, SQL viewer
        ├── features/           dashboard, history and reports logic
        └── services/           calls to the backend API
```

### Useful commands (in `backend/`)

| Command | What it does |
|---|---|
| `npm test` | Runs the backend tests (needs the database running) |
| `npm run test:ai` | Tests the real AI model on known questions |
| `npm run ai:models` | Lists the Gemini models your key can use |
| `npm run db:studio` | Opens a visual browser for the app database |
| `npm run db:seed` | Rebuilds the store data (always the same rows) |
| `npm run db:down` | Stops the database, keeps the data |
| `npm run db:wipe` | Deletes the database completely |
