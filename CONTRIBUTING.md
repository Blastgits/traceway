# Contributing to Traceway

Thanks for your interest in contributing to Traceway. This document covers how to get set up, our PR process, and where to find work.

## Getting Started

### Prerequisites

- Rust (stable, latest)
- Node.js 20+
- SQLite3 (comes with macOS / most Linux distros)

### Setup

```sh
git clone https://github.com/andrewn6/llm-fs.git
cd llm-fs

# Build backend
cargo build

# Build frontend
cd ui && npm install && npm run build && cd ..

# Run locally
cargo run -p daemon -- --foreground
```

API at `localhost:3000`, proxy at `localhost:3001`.

### Verify your setup

```sh
# Backend compiles
cargo check

# Frontend compiles
cd ui && npm run build

# Health check
curl http://localhost:3000/api/health
```

## Finding Work

Issues are in the [`issues/`](./issues/) directory, organized by difficulty:

| Difficulty | Labels | Who should pick these up |
|---|---|---|
| **Easy** | `good first issue` | New contributors, getting familiar with the codebase |
| **Medium** | `enhancement` | Contributors who've read the relevant PRD and adjacent code |
| **Hard** | `breaking-change` or multi-file | Contributors comfortable with Rust async, the full storage stack, or the Svelte frontend |

Each issue links to the relevant PRD in [`prds/`](./prds/) for full context.

### Issue index

**Easy — Good First Issues**

- [#001 — Add pagination types to storage crate](./issues/001-pagination-types.md) `backend` `PRD-06`
- [#002 — Add admin GC endpoint (dry-run orphan detection)](./issues/002-admin-gc-endpoint.md) `backend` `PRD-09`
- [#003 — Add paginated fetch helper to UI API client](./issues/003-paginated-ui-helper.md) `frontend` `PRD-06`
- [#004 — Add retry with exponential backoff to eval LLM calls](./issues/004-eval-retry-with-backoff.md) `backend` `PRD-07`
- [#005 — Recover stale eval runs stuck in "running"](./issues/005-stale-eval-run-recovery.md) `backend` `PRD-09`
- [#013 — Add ModelPricing types and builtin pricing table](./issues/013-model-pricing-types.md) `backend` `PRD-12`
- [#014 — Implement pricing resolution and cost calculation](./issues/014-pricing-resolution.md) `backend` `PRD-12`
- [#020 — Add retroactive cost backfill endpoint](./issues/020-retroactive-cost-backfill.md) `backend` `PRD-12`

**Medium**

- [#006 — Implement keyset pagination for SQLite backend](./issues/006-sqlite-keyset-pagination.md) `backend` `PRD-06`
- [#007 — Wire pagination into API list endpoints](./issues/007-paginated-api-routes.md) `backend` `PRD-06`
- [#008 — Implement SQLite-backed job queue](./issues/008-sqlite-job-queue.md) `backend` `PRD-07`
- [#009 — Implement SQLite event log for durable events](./issues/009-sqlite-event-log.md) `backend` `PRD-10`
- [#015 — Wire cost calculation into proxy](./issues/015-proxy-cost-calculation.md) `backend` `PRD-12`
- [#016 — Add pricing CRUD API endpoints](./issues/016-pricing-crud-api.md) `backend` `PRD-12`
- [#017 — Add pricing storage: SQLite + Turbopuffer backends](./issues/017-pricing-storage-backends.md) `backend` `PRD-12`
- [#019 — Add pricing table UI to cost page](./issues/019-pricing-table-ui.md) `frontend` `PRD-12`

**Hard**

- [#010 — Make PersistentStore cache conditional](./issues/010-conditional-caching.md) `backend` `PRD-08`
- [#011 — Decompose eval runs into per-datapoint jobs](./issues/011-eval-run-job-decomposition.md) `backend` `PRD-07`
- [#012 — SSE event replay with Last-Event-ID](./issues/012-sse-replay.md) `backend` `frontend` `PRD-10`
- [#018 — Build Cost & Usage page UI](./issues/018-cost-usage-page.md) `frontend` `PRD-12`

## Architecture Overview

Read [`agent.md`](./agent.md) for the full workspace layout. Key directories:

```
crates/
  trace/          — Core types (Span, Trace, EvalRun, etc.)
  storage/        — StorageBackend trait + PersistentStore wrapper
  storage-sqlite/ — SQLite implementation
  storage-turbopuffer/ — Turbopuffer cloud implementation
  api/            — Axum HTTP handlers, SSE, eval runner, job queue
  auth/           — Auth middleware (JWT, API keys)
  proxy/          — LLM proxy (Ollama/OpenAI passthrough)
  daemon/         — Binary entry point

ui/
  src/lib/api.ts  — TypeScript API client + types
  src/lib/components/ — Shared Svelte components
  src/routes/     — SvelteKit pages
```

### Key patterns

- **StorageBackend trait** → implemented by SQLite and Turbopuffer
- **PersistentStore** → wraps backend with optional in-memory cache
- **AnyBackend** → runtime dispatch between SQLite/Turbopuffer via `delegate!` macro
- **API handlers** → `auth::Auth(ctx)` → `require_scope()` → `store_for_org()` → read/write
- **SSE events** → `SystemEvent` enum → `tokio::broadcast` → SSE stream
- **UI** → SvelteKit 2, Svelte 5 (runes), Tailwind CSS v4, dark theme

## Pull Request Requirements

### Before opening a PR

1. **Read the relevant PRD** — Every issue links to a PRD. Read it to understand the full picture, not just the single issue.
2. **Check existing code** — Follow the patterns already in the codebase. Don't introduce new frameworks, ORMs, or architectural patterns without discussion.
3. **Keep it focused** — One issue per PR. Don't bundle unrelated changes.

### PR checklist

- [ ] `cargo check` passes (all crates)
- [ ] `cargo check -p api` passes specifically (catches most issues)
- [ ] `npm run build` passes (if UI was changed)
- [ ] No new `unwrap()` in production code paths (use `?` or proper error handling)
- [ ] New public types have `Serialize`/`Deserialize` derives where appropriate
- [ ] SQLite migrations are sequential (check the current version in `MIGRATIONS` array)
- [ ] No secrets, API keys, or `.env` files committed

### PR format

```
## Summary

1-3 sentences on what this PR does and why.

## Changes

- Bullet list of specific changes
- File by file if helpful

## Testing

How you verified this works. Include commands, curl examples, or screenshots.

## Related

- Issue: #NNN
- PRD: PRD-XX
```

### What we look for in review

- **Correctness** — Does it actually solve the issue?
- **Pattern consistency** — Does it follow existing codebase patterns?
- **Error handling** — Are errors propagated properly? No silent failures?
- **Performance** — No accidental O(n^2) or unbounded allocations?
- **Scope** — Is it minimal? No unnecessary refactors or style changes mixed in?

### What will get your PR rejected

- Changing code style (formatting, import ordering) across files you didn't need to touch
- Adding dependencies without justification
- Breaking local mode to fix cloud mode (or vice versa)
- PRs with no description or testing evidence
- Force-pushing after review comments (makes review harder)

## Code Style

### Rust

- Follow `rustfmt` defaults
- Use `tracing` for logging (`tracing::info!`, `tracing::error!`, etc.) — not `println!`
- Error types use `thiserror`
- Async everywhere — we're on Tokio
- Prefer `&str` over `String` in function parameters where possible

### TypeScript / Svelte

- Svelte 5 runes (`$state`, `$derived`, `$effect`) — not Svelte 4 stores
- Tailwind classes directly in markup — no CSS modules
- Dark theme only — use the existing color tokens (`text-text`, `bg-bg-secondary`, `border-border`, etc.)
- Types in `$lib/api.ts` — keep API types co-located with the fetch functions

### Commit messages

- Short imperative first line: "add pagination types to storage crate"
- No emoji, no conventional commit prefixes required
- Reference the issue number in the PR, not necessarily in every commit

## Questions?

Open a discussion or comment on the issue you're working on. Don't start a large PR without confirming the approach first — especially for medium/hard issues.
