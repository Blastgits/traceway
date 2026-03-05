# Internal Contract: Provider Connections

These are the endpoints the Rust API adapter (`crates/api/src/control_plane.rs`) expects.

Base URL: `${TRACEWAY_BACKEND_URL}` (preferred, with legacy control-plane env alias supported)

Auth header:

- `x-traceway-control-token: ${TRACEWAY_BACKEND_TOKEN}`

## List

`GET /internal/provider-connections?org_id=<uuid>&project_id=<uuid>`

Response `200`:

```json
{
  "connections": [
    {
      "id": "uuid",
      "name": "OpenAI Prod",
      "provider": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-...",
      "default_model": "gpt-4o-mini",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

## Get by ID

`GET /internal/provider-connections/:id?org_id=<uuid>&project_id=<uuid>`

- `200` with full `ProviderConnection`
- `404` if missing

## Upsert by ID

`PUT /internal/provider-connections/:id?org_id=<uuid>&project_id=<uuid>`

Body: full `ProviderConnection` JSON.

- `200` on success

## Delete by ID

`DELETE /internal/provider-connections/:id?org_id=<uuid>&project_id=<uuid>`

- `200` on success
- `404` if missing
