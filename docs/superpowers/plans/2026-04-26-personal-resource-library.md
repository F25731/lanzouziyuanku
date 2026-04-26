# Personal Resource Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the project toward a personal blue-cloud resource library with a server API core and a local HTML management console.

**Architecture:** Keep Express/MySQL and the existing ilanzou sync path. Add a token-protected local-admin API, extract search de-duplication into a service, and provide a standalone local HTML console that talks to the server with `X-Admin-Token`.

**Tech Stack:** Node.js, Express, MySQL, built-in `node:test`, single-file HTML/CSS/JS.

---

### Task 1: De-Dupe Service

**Files:**
- Create: `services/dedupeService.js`
- Create: `test/dedupeService.test.js`
- Modify: `routes/api.js`

- [ ] Write tests for novel title de-duplication, variant counting, and preferred result scoring.
- [ ] Run `node --test test/dedupeService.test.js` and confirm the module is missing.
- [ ] Move de-dupe helpers out of `routes/api.js` into `services/dedupeService.js`.
- [ ] Run the de-dupe test again and confirm it passes.

### Task 2: Local Admin API

**Files:**
- Create: `middleware/localAdminAuth.js`
- Create: `routes/localAdmin.js`
- Create: `test/localAdminAuth.test.js`
- Modify: `app.js`
- Modify: `services/lanzouSyncService.js`

- [ ] Write tests for `X-Admin-Token` authorization and OPTIONS/CORS behavior.
- [ ] Run `node --test test/localAdminAuth.test.js` and confirm the module is missing.
- [ ] Implement token authorization from `ADMIN_API_TOKEN`, with fallback to `ADMIN_INIT_PASSWORD` for local validation.
- [ ] Add `/api/local-admin` routes for ping, stats, sources, sync logs, and resources.
- [ ] Wire the router in `app.js`.

### Task 3: Schema Gaps

**Files:**
- Create: `services/schemaService.js`
- Create: `test/schemaService.test.js`
- Modify: `app.js`
- Modify: `database/migrations/001_init.sql`

- [ ] Write tests for missing-column detection SQL generation.
- [ ] Add runtime schema repair for missing `provider`, `root_folder_id`, `download_logs`, and resource metadata fields.
- [ ] Update the fresh-install migration so new databases include the personal-resource fields.

### Task 4: Local HTML Console

**Files:**
- Create: `resource-library-admin.html`

- [ ] Build a standalone local HTML console with server connection settings, sources, sync, resources, logs, and token-ready API status sections.
- [ ] Use `fetch` with `X-Admin-Token` and no build tooling.

### Task 5: Verification

**Files:**
- Modify: `package.json`

- [ ] Add `npm test`.
- [ ] Run `npm test`.
- [ ] Run `npm run check`.
- [ ] Report exact verification commands and results.
