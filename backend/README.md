# Traceway Backend (Encore.ts)

This directory is the scaffold location for the new Encore.ts + Drizzle backend service.

Current app location: `backend/app`.

Implemented first migration slice in `backend/app/provider_connections/`:

- `api.ts` - internal provider-connections endpoints used by Rust adapter
- `schema.ts` - Drizzle table schema
- `database.ts` - Encore SQLDatabase + Drizzle wiring
- `migrations/` - Drizzle-generated SQL migrations

## Purpose

Move relational/configuration domains out of the Turbopuffer-backed Rust storage path:

- provider connections
- capture rules
- datasets/datapoints
- queue items
- eval runs/results

The Rust API remains the public entrypoint and delegates to this service as migration flags are rolled out.

## Runtime flags in Rust API

- `TRACEWAY_BACKEND_MODE=off|shadow|on` (preferred)
- `TRACEWAY_BACKEND_URL=https://backend.internal` (preferred)
- `TRACEWAY_BACKEND_TOKEN=<service-token>` (preferred)
- Legacy aliases remain supported in Rust for compatibility:
  - `TRACEWAY_CONTROL_PLANE_MODE`
  - `TRACEWAY_CONTROL_PLANE_URL`
  - `TRACEWAY_CONTROL_PLANE_TOKEN`

Current implementation status:

- Provider connections path is wired behind these flags.
- `off`: local storage only
- `shadow`: local storage + best-effort mirror writes to backend
- `on`: backend as primary source of truth

## Next implementation steps

1. Run `encore run` inside `backend/app` to bootstrap local infra.
2. Smoke test provider-connections endpoints against Rust `shadow` mode.
3. Add capture-rules domain next.
4. Add contract tests against `crates/api/src/control_plane.rs` behavior.
