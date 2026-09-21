# Build plane-axi

You are building `plane-axi`, an ergonomic CLI for the Plane project tracker.
The project is scaffolded at `/home/tama/projects/plane-axi`.

## What to build

A Node.js CLI (no TypeScript, no dependencies — use `node:fetch`) that wraps
the Plane v1 API. Follow the ergonomic-CLI pattern from the axi spec:
structured output, subcommands for common cases, helpful errors, `--json` flag.

## Environment

```bash
PLANE_API_KEY   # in ~/.claude.json → mcpServers.plane.env.PLANE_API_KEY
PLANE_BASE_URL  # https://plane.tama.dev
PLANE_WORKSPACE_SLUG  # pertama
```

## API reference (verified working)

- Auth: `X-API-Key` header on every request
- Base: `$PLANE_BASE_URL/api/v1/workspaces/$SLUG/`
- `GET  projects/` → list projects (results[], each has id, identifier, name)
- `GET  projects/<id>/issues/?per_page=100` → list issues (results[], each has id, sequence_id, name, state, priority)
- `GET  projects/<id>/states/` → list states (results[], each has id, name, group)
- `POST projects/<id>/issues/` → create (body: {name, description_html, state, priority})
- `PATCH projects/<id>/issues/<issue-id>/` → update (body: {state, name, priority})
- `POST projects/<id>/issues/<issue-id>/comments/` → comment (body: {comment_html})

## Key design decisions

1. `--project` accepts either the UUID, the identifier (LNKIN), or the name — resolve via the projects list
2. Sequence IDs (#188) are the user-facing identifiers — resolve to UUIDs via the issues list
3. State names ("Todo", "Done") resolve to state UUIDs via the states list
4. Output format: structured lines like gh-axi — `key=value` pairs, not JSON blobs (unless `--json`)
5. No dependencies — plain Node.js, `node:fetch`, `node:util.parseArgs`

## Priority order

1. `issues` (list) — most used
2. `issue view` — read one
3. `issue close` — with optional comment
4. `issue create` — with title, state, priority
5. `projects` / `states` — reference commands
6. `issue comment` / `issue update`

## Testing

Test against the real instance at https://plane.tama.dev (workspace: pertama).
Create test issues in the "Pertama" project (identifier: PERTA) so you don't
pollute the main LNKIN project. Clean up after yourself.

## Definition of done

- `plane-axi issues --project LNKIN --state Todo` returns the 32 triage items
- `plane-axi issue close 110 --project LNKIN --comment "delivered"` works
- `npm link` makes it globally available
- README accurately reflects the commands
