# Encore Stack Notes (Queueing, DB, Infra)

Based on current Encore.ts + Encore Cloud docs.

## What we can use right now

### 1) Database (yes)

- Primitive: `SQLDatabase` (`encore.dev/storage/sqldb`)
- Backend: PostgreSQL (local via Docker, cloud via managed Postgres on AWS/GCP, optional Neon)
- ORM: Drizzle is first-class documented integration (`db.connectionString` + `drizzle-orm/node-postgres`)
- Migrations: SQL migration files (`*.up.sql`) auto-applied by Encore on run/deploy

### 2) Queueing / async work (yes)

- Primitive: `Topic` + `Subscription` (`encore.dev/pubsub`)
- Delivery guarantees:
  - `at-least-once` (default)
  - `exactly-once` option (with provider throughput tradeoffs)
- Retry + DLQ behavior handled by platform
- Ordered delivery supported with `orderingAttribute`

### 3) Scheduled jobs (yes)

- Primitive: `CronJob` (`encore.dev/cron`)
- Runs in cloud environments, not local dev
- Good for:
  - stale-job recovery sweeps
  - backfills
  - retention/cleanup tasks

### 4) File/blob storage (yes)

- Primitive: `Bucket` (`encore.dev/storage/objects`)
- Backends: S3/GCS and S3-compatible providers
- Supports signed upload/download URLs

### 5) Infra ownership model (yes)

- Encore Cloud can deploy to **our own** AWS/GCP account (not shared runtime)
- Can configure environments independently, including Neon Postgres option
- Terraform provider exists for integrating Encore-managed infra with existing infra

## Recommended mapping for Traceway backend

- Postgres + Drizzle:
  - provider connections
  - capture rules
  - datasets
  - datapoints
  - queue items
  - eval runs
  - eval results

- Pub/Sub:
  - async eval job fanout
  - enrichment/indexing events
  - webhook/event propagation

- Cron:
  - stale eval/run recovery
  - dead-letter replay workflows
  - integrity checks

- Object Storage:
  - file contents / exports / large payload artifacts

## Notes / caveats

- Local dev needs Docker for SQLDatabase provisioning.
- Cron does not execute in local env (call endpoint manually for testing).
- Subscription handlers should still be idempotent, even with exactly-once mode.
