# plane-axi

Ergonomic CLI for the Plane project tracker. Wraps the Plane v1 API the same way
gh-axi wraps GitHub — subcommands for the 90% cases, TOON structured output, no curl.

Plain Node.js (>= 22), zero dependencies.

## Setup

```bash
npm i -g plane-axi   # or: npm link from a checkout
export PLANE_API_KEY=plane_api_...
export PLANE_BASE_URL=https://your-plane.example.com
export PLANE_WORKSPACE_SLUG=your-workspace
export PLANE_PROJECT=LNKIN   # optional default for --project
```

## Commands

```
plane-axi                                        home view: projects + next steps
plane-axi projects                               list projects (identifier, name)
plane-axi states [--project <ref>]               list states (name, group)
plane-axi issues [--project <ref>] [--state <name>] [--priority <p>] [--limit <n>]
plane-axi issue view <seq> [--project <ref>] [--comments] [--full]
plane-axi issue create --title <text> [--project <ref>] [--state <name>] [--priority <p>] [--description <text>]
plane-axi issue update <seq> [--project <ref>] [--state <name>] [--title <text>] [--priority <p>]
plane-axi issue close <seq> [--project <ref>] [--comment <text>]
plane-axi issue comment <seq> <text> [--project <ref>]
```

Every command also accepts `--json` (raw API JSON) and `--help`.

## Conventions

- `--project` accepts the UUID, the identifier (`LNKIN`), or the exact name.
  Without it, the CLI uses `$PLANE_PROJECT`, or the sole project if the
  workspace has exactly one.
- Issues are addressed by their human-facing sequence ID (`110` or `#110`).
- `--state` accepts a state name (`Todo`, `Done`) or a group
  (`backlog`, `unstarted`, `started`, `completed`, `cancelled`).
- Priorities: `urgent`, `high`, `medium`, `low`, `none`.
- Lists paginate internally (all issues are fetched before filtering), so
  counts in the `count:` line are definitive.
- `issue close` is idempotent: closing an already-closed issue is a no-op with
  exit 0 (a `--comment` is still added — commenting is separate intent).
- Output is TOON (`key[N]{fields}:` tables, `key: value` objects). Errors go to
  stdout as `error:` + `help:` lines. Exit codes: 0 success/no-op, 1 error,
  2 usage error.

## Examples

```
$ plane-axi issues --project LNKIN --state Todo
count: 32 (of 219 total in project LNKIN)
issues[32]{seq,name,state,priority}:
  188,Quick win: fix History empty state pointing at the removed Submit tab,Todo,low
  ...

$ plane-axi issue close 110 --project LNKIN --comment "delivered"
comment: added to #110
issue:
  seq: 110
  state: Done
  project: LNKIN

$ plane-axi issue create --project PERTA --title "Fix login" --priority high --state Todo
issue:
  seq: 10
  title: Fix login
  state: Todo
  priority: high
  project: PERTA
help[1]:
  Run 'plane-axi issue view 10 --project PERTA' for details
```

## Tests

```bash
npm test
```
