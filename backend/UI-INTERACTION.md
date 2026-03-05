# UI Interaction Model (Rust + Encore)

This is the intended interaction model during migration.

## Runtime flow

1. Browser UI talks to Rust API (`/api/*`) as today.
2. Rust remains the BFF and auth/session boundary for the browser.
3. Rust delegates business-domain operations to Encore backend internal APIs.
4. Rust keeps ownership of ingest and streaming paths:
   - traces/spans ingest
   - OTLP `/v1/traces`
   - SSE `/api/events`

## Why this model

- No service token leakage to the browser.
- UI API contract remains stable while backend storage/logic migrates.
- Enables `off|shadow|on` rollout in Rust per domain.

## Domains now implemented in Encore backend

- provider connections
- datasets + datapoints
- queue
- eval runs + eval results
- capture rules
- file versions metadata

All of the above are available as authenticated internal APIs under `/internal/*` in `backend/app`.

## What remains for full UI cutover

Rust adapter coverage is still needed for the newly implemented domains so UI traffic is fully served by Encore-backed logic behind existing `/api/*` routes.
