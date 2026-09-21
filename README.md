# plane-axi

Ergonomic CLI for the Plane project tracker. Wraps the Plane v1 API the same way
gh-axi wraps GitHub — subcommands for the 90% cases, structured output, no curl.
No dependencies: plain Node.js (`node:fetch`, `node:util.parseArgs`).

## Setup

```bash
npm i -g plane-axi   # or: npm link from a checkout
export PLANE_API_KEY=plane_api_...
export PLANE_BASE_URL=https://your-plane.example.com
export PLANE_WORKSPACE_SLUG=your-workspace
export PLANE_PROJECT=LNKIN   # optional default --project
```

## Commands

```
plane-axi                                    # home view: projects + command list
plane-axi projects
plane-axi states [--project P]
plane-axi issues [--project P] [--state NAME] [--priority p] [--limit N] [--fields f1,f2]
plane-axi issue view <seq-id> [--project P] [--full]
plane-axi issue create --title "..." [--project P] [--state NAME] [--priority p] [--description "text"]
plane-axi issue update <seq-id> [--project P] [--state NAME] [--title "..."] [--priority p]
plane-axi issue close <seq-id> [--project P] [--comment "text"]
plane-axi issue comment <seq-id> <text> [--project P]
```

Every command takes `--json` for JSON output and `--help` for usage examples.

## Conventions

- `--project` accepts a UUID, an identifier (`LNKIN`), or an exact project name.
  It defaults to `$PLANE_PROJECT`, or the sole project if the workspace has one.
- Issues are addressed by sequence ID (`110` or `#110`) — human-facing numbers.
- `--state` accepts a state name (`Todo`) or a group
  (`backlog`, `unstarted`, `started`, `completed`, `cancelled`).
- `--priority` is one of `urgent`, `high`, `medium`, `low`, `none`.
- `issue close` is idempotent: closing an already-closed issue is a no-op with exit 0.
- Default output is structured TOON lines (`issues[32]{seq,title,state,priority}:` ...).
- Errors print to stdout as `error:` / `code:` / `help:` blocks. Exit codes:
  0 success (including no-ops), 1 error, 2 usage error. Unknown flags are rejected.

## Examples

```
$ plane-axi issues --project LNKIN --state Todo
count: 32 of 219 total
issues[32]{seq,title,state,priority}:
  219,Real work: MCP tools declare no read/write scope...,Todo,medium
  ...

$ plane-axi issue close 110 --project LNKIN --comment "delivered"
issue:
  seq: #110
  state: Done (already closed - no-op)
  comment: added
```

## Development

```bash
npm test        # offline unit tests (node:test)
npm link        # install globally from this checkout
```
