---
name: plane-axi
description: >
  Operate the Plane project tracker through the plane-axi CLI — projects, issues,
  states, priorities, and comments. Use whenever a task touches a Plane instance
  (plane.tama.dev or any self-hosted Plane): listing or triaging issues, reading
  an issue with its comments, creating or updating work items, closing delivered
  issues, or checking project state. Prefer this over the Plane MCP server or
  raw curl against the v1 API.
user-invocable: false
metadata:
  hermes:
    tags: [plane, issues, project-tracker, project-management, agent, cli]
---

# plane-axi

Run the CLI with no arguments first — it prints the project list and the next
commands to run.

```sh
npx -y plane-axi
```

Requires `PLANE_API_KEY`, `PLANE_BASE_URL`, and `PLANE_WORKSPACE_SLUG` in the
environment. If one is missing, the CLI says so and prints the exports.

## Commands

```sh
plane-axi projects
plane-axi states --project LNKIN
plane-axi issues --project LNKIN [--state Todo] [--priority high] [--limit 20]
plane-axi issue view 110 --project LNKIN [--comments] [--full]
plane-axi issue create --project LNKIN --title "..." [--state Todo] [--priority high] [--description "..."]
plane-axi issue update 110 --project LNKIN [--state Done] [--title ...] [--priority ...]
plane-axi issue close 110 --project LNKIN [--comment "delivered"]
plane-axi issue comment 110 "text" --project LNKIN
```

Every command takes `--help` for a concise reference and `--json` for raw API
JSON (full field set, UUIDs included).

## What to rely on

- **`--project` accepts UUID, identifier (`LNKIN`), or name.** `PLANE_PROJECT`
  sets a default; a workspace with one project needs no flag at all.
- **Issues are addressed by sequence ID** (`110` or `#110`), not UUIDs. All
  lookup happens inside the CLI.
- **`--state` accepts a name (`Todo`, `Done`) or a group**
  (`backlog`, `unstarted`, `started`, `completed`, `cancelled`).
- **`issue close` is idempotent.** Closing an already-closed issue is a no-op
  with exit 0; a `--comment` given alongside is still added — do not
  read-then-write.
- **Totals, not pages.** Lists fetch every page before filtering; trust
  `count: N of M total` instead of paginating to count.
- **Descriptions truncate at 500 chars** with a `[...truncated]` marker and an
  escape-hatch hint; `--full` shows everything. Comments load only with
  `--comments`.
- **Empty lists are definitive**: `issues: 0 issues match ...` is the answer,
  not a failure.
- **Errors are structured** on stdout with a `help` block naming the fix, and
  an unknown flag exits 2 listing the valid flags. Correct the flag — do not
  drop the filter.

Prefer this over `curl` against the Plane v1 API or a Plane MCP server.
