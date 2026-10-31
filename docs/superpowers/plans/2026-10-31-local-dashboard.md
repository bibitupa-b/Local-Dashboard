# Local Dashboard — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, read-only dashboard that logs changes in an Obsidian vault and Google Drive, surfaces what needs attention, and generates a daily DeepSeek briefing.

**Architecture:** One Node 26 process exposes a Fastify API on `127.0.0.1:4317`, serves a built React SPA, watches the vault with `chokidar`, polls Drive on a cron, and stores everything in SQLite via built-in `node:sqlite`. Sources implement one contract (`configured/sync/digest`) so later Gmail and Calendar need no changes to the shell.

**Tech Stack:** Node 26 · TypeScript · Fastify · `node:sqlite` · React + Vite + Tailwind · `chokidar` · `googleapis` · `node-cron` · Vitest

**Spec:** Approved decisions in `AGENTS.md` plus the agreed conversation design (design doc deferred by the user until core tasks are done).

## Global Constraints

- Node.js 26+; **no native addons** — SQLite is `node:sqlite`.
- Windows first; UTF-8 everywhere; vault folder names contain Cyrillic and emoji — always `path.join`, never string-concatenated separators.
- Read-only: never write to vault notes or Drive.
- Only a compact digest (≤ 12,000 chars) is sent to `https://api.deepseek.com`; never raw vault files.
- Secrets only in `.env` and `data/`; both gitignored. Never log tokens.
- Default port `4317`. Main screen has exactly three blocks: briefing, activity feed, attention queue.
- Exclude from vault scanning: `.obsidian`, `.smart-env`, `.stfolder`, `Attachments`, non-`.md` files. `Templates/` is scanned for history but its tasks never enter the attention queue.
- Every task ends with a passing test run and a commit.

## Review Focus

Inputs and failures the user will actually hit, most likely first:

1. Cyrillic/emoji vault paths — a note in `02 Areas/🎓 Education/…` must be indexed and displayed intact.
2. A note with no frontmatter, CRLF endings, or a BOM must parse without throwing; tasks still extracted.
3. DeepSeek down, 401, or 429 — briefing creation fails visibly, sync and the rest of the dashboard keep working.
4. Missing `DEEPSEEK_API_KEY` or unconfigured Google — app boots, shows a setup prompt, no crash loop.
5. A long note (100 KB) — digest stays under budget and the briefing still completes.

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .env.example, .gitignore
src/server/
  config.ts              env → typed Config
  db/schema.sql          DDL
  db/index.ts            openDb, migrate, settings get/set
  sources/types.ts       Source contract + shared row types
  sources/vault/scan.ts  walk + hash
  sources/vault/parse.ts frontmatter, tasks, tags
  sources/vault/diff.ts  line diff + counts
  sources/vault/index.ts scan → change rows, chokidar watch
  sources/drive.ts       OAuth factory + injectable client + sync
  attention.ts           queue rules
  briefing/digest.ts     digest assembly + truncation
  briefing/deepseek.ts   API call
  briefing/index.ts      generate + persist + catch-up
  briefing/schedule.ts   shouldCatchUp (pure)
  routes.ts              HTTP API
  app.ts                 Fastify factory (testable)
  index.ts               process entry: config, db, watcher, cron, listen
src/web/                 React app (App.tsx, Settings.tsx, api.ts, main.tsx)
tests/fixtures/vault/    sample notes incl. Cyrillic path + no-frontmatter note
scripts/start-hidden.vbs autostart launcher
```

---

### Task 0: Commit project documents

**Files:** `README.md`, `AGENTS.md` (already written), this plan.

- [ ] **Step 1:** `mkdir -p docs/superpowers/plans` and copy this plan to `docs/superpowers/plans/2026-10-31-local-dashboard.md`.
- [ ] **Step 2:** Commit

```powershell
git add README.md AGENTS.md docs/
git commit -m "docs: add project overview and agent guidelines"
```

---

### Task 1: Scaffold and health endpoint

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/server/config.ts`, `src/server/app.ts`, `src/server/index.ts`, `tests/health.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config` with fields `{ port: number; vaultPath: string; dataDir: string; dbPath: string; deepseekKey: string | null; googleClientId: string | null; googleClientSecret: string | null; briefingHour: number }`.
- Produces: `buildApp(deps: { db: DatabaseSync; config: Config }): FastifyInstance`.
- Produces: `GET /api/health → { ok: true }`.

- [ ] **Step 1:** `npm init -y`, then install `fastify @fastify/static chokidar googleapis node-cron` and dev deps `typescript tsx vitest @types/node`.
- [ ] **Step 2:** Write `.gitignore` (`node_modules/`, `dist/`, `data/`, `.env`, `*.log`) and `.env.example` with the five variables from README (`DEEPSEEK_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAULT_PATH`, `PORT`) plus `BRIEFING_HOUR=8`.
- [ ] **Step 3:** Failing test:

```ts
// tests/health.test.ts
import { expect, test } from 'vitest'
import { buildApp } from '../src/server/app'
import { openDb } from '../src/server/db'
import { loadConfig } from '../src/server/config'

test('health responds ok', async () => {
  const db = openDb(':memory:')
  const app = buildApp({ db, config: loadConfig({}) })
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ ok: true })
})
```

- [ ] **Step 4:** Run `npx vitest run tests/health.test.ts` — expect failure (modules missing).
- [ ] **Step 5:** Implement `config.ts` (defaults: port 4317, `vaultPath = join(homedir(),'Documents','Main Obsidian Vault')`, `dataDir = join(process.cwd(),'data')`, `dbPath = join(dataDir,'dashboard.db')`, `briefingHour = 8`), `app.ts` (registers health route), and a stub `db/index.ts` with `openDb` so the test compiles.
- [ ] **Step 6:** `npx vitest run` — PASS. Add npm scripts `dev`, `build`, `start`, `test`.
- [ ] **Step 7:** Commit `feat: scaffold Fastify app and config`.

---

### Task 2: Database schema and settings

**Files:** Create `src/server/db/schema.sql`, `src/server/db/index.ts`; Test `tests/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): DatabaseSync` (creates `data/` when path is a file, applies `schema.sql` idempotently).
- Produces: `getSetting(db, key): string | null`, `setSetting(db, key, value: string): void`.
- Tables exactly as documented in `AGENTS.md`; `vault_changes.detected_at` and `briefings.created_at` are ISO-8601 UTC strings.

- [ ] **Step 1:** Failing test: open `:memory:`, call `migrate` twice (no throw), insert and read a setting, assert `settings` row round-trips.
- [ ] **Step 2:** Run — FAIL (no schema).
- [ ] **Step 3:** Write `schema.sql` with the seven tables and indexes on `vault_changes(detected_at)`, `tasks(done, tag)`, `drive_changes(detected_at)`; implement `openDb`/`migrate`/settings helpers.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: add SQLite schema and settings store`.

---

### Task 3: Note parsing and line diff

**Files:** Create `src/server/sources/vault/parse.ts`, `src/server/sources/vault/diff.ts`; Tests `tests/parse.test.ts`, `tests/diff.test.ts`

**Interfaces:**
- Produces: `parseNote(text: string): { frontmatter: Record<string, string | string[]>; tasks: Array<{ text: string; tag: string | null; done: boolean }> }`.
- Produces: `lineDiff(before: string, after: string): { added: number; removed: number; diff: string }` (unified diff text, empty diff and zero counts when identical).

- [ ] **Step 1:** Failing tests:

```ts
// frontmatter + tags
expect(parseNote('---\nstatus: Undone\ntags:\n  - work\n---\n\n- [ ] #vitamins Zinc\n- [x] done thing')
  .tasks).toEqual([
    { text: '#vitamins Zinc', tag: 'vitamins', done: false },
    { text: 'done thing', tag: null, done: true },
  ])
// no frontmatter, CRLF, BOM
expect(parseNote('\uFEFF# Title\r\n- [ ] plain\r\n').frontmatter).toEqual({})
// must not throw
expect(parseNote('').tasks).toEqual([])
expect(lineDiff('a\nb', 'a\nc')).toMatchObject({ added: 1, removed: 1 })
expect(lineDiff('same', 'same')).toEqual({ added: 0, removed: 0, diff: '' })
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement with a small hand-rolled frontmatter reader (no YAML dependency) that handles `key: value`, `tags: [a, b]`, and indented `- item` lists; task regex `^\s*- \[( |x)\] (.*)$`; tag = first `#word` in task text.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: parse notes and compute line diffs`.

---

### Task 4: Vault scan, change log, and watcher

**Files:** Create `src/server/sources/vault/scan.ts`, `src/server/sources/vault/index.ts`, `src/server/sources/types.ts`; Test `tests/vault.test.ts`; fixtures under `tests/fixtures/vault/` (one note in `02 Areas/🎓 Education/`, one without frontmatter)

**Interfaces:**
- Produces: `scanVault(root: string): Promise<Array<{ path: string; hash: string; mtime: string; size: number }>>` — `path` is vault-relative with forward slashes.
- Produces: `applyVaultChanges(db, entries): Promise<number>` — upserts `vault_files`, writes one `vault_changes` row per changed/added note with diff and snapshot text; returns count.
- Produces: `startVaultWatcher(root: string, db): () => Promise<void>` — debounced 1 s, calls `applyVaultChanges` for touched files, returns a stop function.
- Produces: `vaultSource: Source` implementing the contract in `AGENTS.md`.

- [ ] **Step 1:** Failing test: copy fixtures to a temp dir, run `applyVaultChanges` twice; second run adds 0 rows; after editing one note it adds exactly 1 row with correct `added`/`removed`; `scanVault` returns forward-slash relative paths and skips `Attachments`/non-md.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement scan with `fs.promises.readdir({ recursive: true })` (Node 26) plus an ignore predicate; hash with `crypto.createHash('sha256')`.
- [ ] **Step 4:** Implement change application: read text, diff against `vault_files.previous_text`, insert row, update file row.
- [ ] **Step 5:** Run — PASS.
- [ ] **Step 6:** Commit `feat: index vault notes and log changes`.

---

### Task 5: Attention queue

**Files:** Create `src/server/attention.ts`; Test `tests/attention.test.ts`

**Interfaces:**
- Produces: `buildAttention(db, now: Date, opts: { staleDays: number; inboxDays: number }): AttentionItem[]` with `type AttentionItem = { kind: 'task' | 'stale-project' | 'inbox' | 'drive'; label: string; detail: string; count?: number; path?: string }`.

- [ ] **Step 1:** Failing tests on a seeded temp DB: five open `#vitamins` tasks collapse to one item with `count: 5`; a project with `status: Undone` and `vault_files.mtime` 20 days old appears once; a project touched yesterday does not; an `Inbox/` note 4 days old appears, a fresh one does not; checklist items from `Templates/` never appear; tasks with `done = 1` never appear.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement SQL-backed queries plus one grouping pass; sort tasks by descending count, then stale projects, then inbox, then drive.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: build attention queue`.

---

### Task 6: Google Drive source

**Files:** Create `src/server/sources/drive.ts`; Test `tests/drive.test.ts`

**Interfaces:**
- Produces: `type DriveApi = { listSince(cursor: string | null): Promise<{ files: Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>; nextCursor: string | null }> }`.
- Produces: `createDriveSource(deps: { api: DriveApi | null; db: DatabaseSync }): Source` — `configured()` is false when `api` is null.
- Produces: `createGoogleDriveApi(config, tokenStore): Promise<DriveApi | null>` using `googleapis`, scope `drive.readonly`, and `data/google-token.json`; returns `null` when app credentials are missing.
- Sync semantics: first run records files silently (cursor only); later runs insert `drive_changes` rows for new ids (`kind = 'added'`) and newer `modifiedTime` (`kind = 'modified'`), then persist the new cursor in `settings`.

- [ ] **Step 1:** Failing test with a fake `DriveApi`: first sync produces 0 changes; a second sync returning one new file and one touched file produces exactly 2 rows; `configured()` false for `api: null`; a thrown error from `listSince` propagates and leaves the cursor unchanged.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the source, then the googleapis adapter (thin: build `OAuth2Client` from config + stored token, call `drive.files.list({ q: 'trashed=false', orderBy: 'modifiedTime desc', pageSize: 100, fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)' })`).
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: sync Google Drive changes`.

---

### Task 7: Digest builder

**Files:** Create `src/server/briefing/digest.ts`; Test `tests/digest.test.ts`

**Interfaces:**
- Produces: `buildDigest(input: { since: Date; vaultChanges: Array<{ path: string; added: number; removed: number }>; tasks: Array<{ text: string; done: boolean; tag: string | null }>; attention: AttentionItem[]; driveChanges: Array<{ name: string; kind: string }> }): string`.
- Produces: `MAX_DIGEST_CHARS = 12000`.

- [ ] **Step 1:** Failing tests: digest contains the changed note path and `+/-` counts; recurring tag appears once with a count; a 100 KB change excerpt is truncated so `digest.length <= MAX_DIGEST_CHARS`; an empty day still yields a valid digest containing `No changes`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement as plain sections (`## Vault changes`, `## Tasks`, `## Needs attention`, `## Drive`), truncating per-line excerpts to 200 chars before applying the global cap.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: assemble briefing digest`.

---

### Task 8: DeepSeek call, briefing persistence, catch-up

**Files:** Create `src/server/briefing/deepseek.ts`, `src/server/briefing/index.ts`, `src/server/briefing/schedule.ts`; Test `tests/briefing.test.ts`

**Interfaces:**
- Produces: `generateBriefing(apiKey: string, digest: string, fetchFn?: typeof fetch): Promise<string>` — throws `BriefingError` (with `status`) on non-2xx or empty content.
- Produces: `createBriefing(db, sources, config, fetchFn?): Promise<{ markdown: string } | { error: string }>` — assembles, calls, stores row with trigger `auto`/`manual`.
- Produces: `shouldCatchUp(lastBriefingAt: Date | null, now: Date, hour: number): boolean` — true when no briefing today and `now` is at/after `hour`, or when none exists at all.

- [ ] **Step 1:** Failing tests: a 401 from the fake fetch throws `BriefingError` with `status: 401`; successful call stores one `briefings` row with the returned markdown; missing key returns `{ error: 'no-key' }` without calling fetch; `shouldCatchUp` cases (yesterday + 07:59 → false, yesterday + 08:00 → true, today's briefing → false).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement POST to `https://api.deepseek.com/chat/completions` with `{ model: 'deepseek-chat', temperature: 0.3, max_tokens: 700 }`, a system prompt asking for 5–7 bullets (what moved, what is stuck, one suggestion, plain text, no preamble), and a 30 s timeout via `AbortSignal.timeout(30_000)`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: generate and persist daily briefings`.

---

### Task 9: HTTP API and static serving

**Files:** Create `src/server/routes.ts`; Modify `src/server/app.ts`, `src/server/index.ts`; Test `tests/api.test.ts`

**Interfaces:**
- Produces routes: `GET /api/status`, `GET /api/feed?days=7`, `GET /api/attention`, `GET /api/briefings?limit=10`, `POST /api/briefings/generate`, `GET /api/settings`, `PUT /api/settings`, `GET /api/oauth/google/start`, `GET /api/oauth/google/callback`.
- `POST /api/briefings/generate` → `200 { markdown }` or `400 { error: 'no-key' }` or `502 { error: string }`.
- `GET /api/status` → `{ sources: Array<{ id: string; configured: boolean; lastSync: string | null }>; briefingToday: boolean }`.

- [ ] **Step 1:** Failing tests via `app.inject`: health already covered; `/api/status` lists `vault` (configured true) and `drive` (configured false with fake null client); `/api/feed` returns grouped days; `POST /api/briefings/generate` with no key returns 400 `no-key`; unknown route returns 404 JSON.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement routes, `@fastify/static` serving `dist/web` with SPA fallback, and `index.ts` wiring: ensure `data/`, open DB, initial vault sync, start watcher, register cron `0 <briefingHour> * * *` plus catch-up check on boot, `listen({ host: '127.0.0.1', port })`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: expose dashboard API and wire the server`.

---

### Task 10: Web interface

**Files:** Create `vite.config.ts` (root `src/web`, proxy `/api` → 4317, `@tailwindcss/vite`), `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/Settings.tsx`, `src/web/api.ts`; Test `tests/web.test.tsx`

**Interfaces:**
- Consumes: the routes from Task 9.
- Produces: three-section page — Briefing (latest card, "Briefing now" button, previous collapsed), Activity feed (grouped by day, vault + Drive), Attention queue (grouped rows with counts).
- Produces: Settings route with vault path, briefing hour, DeepSeek key status, "Connect Google Drive" link; save via `PUT /api/settings`.

- [ ] **Step 1:** Add `react react-dom`, dev `@vitejs/plugin-react tailwindcss @tailwindcss/vite jsdom @testing-library/react`.
- [ ] **Step 2:** Failing smoke test: mock `fetch` returning empty payloads; assert the three headings render and the empty states say "No changes yet" / "Nothing needs attention".
- [ ] **Step 3:** Run — FAIL.
- [ ] **Step 4:** Implement `api.ts` (typed fetch helpers), `App.tsx` with `useEffect` load + 60 s feed poll, `Settings.tsx`. Keep cards flat, no charts, no icon library.
- [ ] **Step 5:** Run `npx vitest run` and `npm run build` — both PASS.
- [ ] **Step 6:** Commit `feat: add dashboard interface`.

---

### Task 11: Autostart and end-to-end check

**Files:** Create `scripts/start-hidden.vbs`; Modify `README.md` (exact autostart steps), `package.json` (build includes server bundle via `tsx` or `tsc`)

- [ ] **Step 1:** `start-hidden.vbs` runs `npm start` with the working directory set to the repo and window hidden.
- [ ] **Step 2:** Document in README: create shortcut to the `.vbs` in `Win+R → shell:startup`.
- [ ] **Step 3:** Manual smoke: `npm run build && npm start`, open `http://localhost:4317`, confirm vault changes appear after editing a note, the three blocks render, and the briefing button reports the missing-key state when `.env` is empty.
- [ ] **Step 4:** Commit `chore: add autostart script and finalize docs`.

---

## Self-Review

- **Spec coverage:** history (Tasks 4, 6), attention queue (5), briefing (7, 8), schedule + catch-up (8, 9), UI (10), autostart (11), privacy constraint (7 global cap, Task 8 payload), read-only (no write paths anywhere).
- **Deferred by user:** separate design doc, Gmail/Calendar, tray, notifications, search.
- **Type consistency:** `Source` contract defined once in Task 4 and consumed by Tasks 6 and 9; `AttentionItem` defined in Task 5, consumed in 7 and 9; `Config` defined in Task 1 and reused.
- **Review Focus tests:** Cyrillic path (Task 4 fixtures), no-frontmatter/CRLF/BOM (Task 3), DeepSeek failures and missing key (Task 8, 9), long note truncation (Task 7), missing Google credentials (Task 6, 9).
