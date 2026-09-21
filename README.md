# plane-axi

Ergonomic CLI for the Plane project tracker. Wraps the Plane v1 API the same way
gh-axi wraps GitHub — subcommands for the 90% cases, structured output, no curl.

## Setup

```bash
npm i -g plane-axi
export PLANE_API_KEY=plane_api_...
export PLANE_BASE_URL=https://your-plane.example.com
export PLANE_WORKSPACE_SLUG=your-workspace
```

## Commands (target)

```
plane-axi issues [--project <id|identifier>] [--state <name>] [--assignee <id>] [--limit <n>]
plane-axi issue view <sequence-id> [--project <id>]
plane-axi issue create --title "..." [--project <id>] [--state <name>] [--priority <p>] [--description <text>]
plane-axi issue close <sequence-id> [--project <id>] [--comment <text>]
plane-axi issue update <sequence-id> [--state <name>] [--title ...] [--priority ...]
plane-axi issue comment <sequence-id> <text>
plane-axi projects
plane-axi states [--project <id>]
plane-axi labels [--project <id>]
plane-axi members
plane-axi cycles [--project <id>]
```

All output is structured (same JSON shape as gh-axi). `--project` defaults to
$PLANE_PROJECT or the sole project. Sequence IDs are the human-facing #NNN.
