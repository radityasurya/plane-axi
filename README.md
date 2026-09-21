<h1 align="center">plane-axi</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/plane-axi"><img alt="npm" src="https://img.shields.io/npm/v/plane-axi?style=flat-square" /></a>
  <a href="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square"><img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square" /></a>
  <a href="https://axi.md"><img alt="AXI" src="https://img.shields.io/badge/built%20with-AXI-black?style=flat-square" /></a>
</p>

<h3 align="center">Plane CLI for agents.</h3>

Manage [Plane](https://plane.so) projects, issues, states, priorities, and comments
from the shell — designed with [AXI](https://axi.md) (Agent eXperience Interface).

Talks to the Plane v1 API directly with token-efficient TOON output, sequence-ID
addressing (`#110`, not uuids), name-based state and project resolution, and
contextual next-step suggestions. Plain Node.js (22+), zero dependencies.

## Why

Agent ergonomics is measurable. On a real Plane workspace listing all 219 issues of
the `LNKIN` project:

| Command | Raw Plane v1 API JSON | `plane-axi` | Reduction |
| --- | --- | --- | --- |
| `issues` | 323,049 B | 15,665 B | **21×** |

Plane returns 29 fields per issue; an agent needs four of them to decide what to do
next. The rest — uuids for state, assignees, labels, estimates, cycle and module
memberships — is available on demand via `issue view` or `--json`.

Beyond size, the v1 API addresses everything by uuid: state names come back as
`42ae361b-9965-…`, issues by `48b0b460-…`. `plane-axi` takes what a human or agent
actually says, so `plane-axi issue close 110 --project LNKIN --comment "delivered"`
replaces a projects-lookup, a states-lookup, an issues-page-walk, and a PATCH.

## Quick Start

Install the skill in the [Agent Skills](https://agentskills.io) format with
[`npx skills`](https://github.com/vercel-labs/skills):

```sh
npx skills add radityasurya/plane-axi --skill plane-axi -g
```

That is the entire setup — no npm install needed. The skill is a minimal discovery
stub that directs your agent to the always-current `npx -y plane-axi` dashboard and
help output instead of duplicating command guidance.

You also need API access to a Plane instance (cloud or self-hosted):

```sh
export PLANE_API_KEY=plane_api_...          # Plane → Settings → API tokens
export PLANE_BASE_URL=https://your-plane.example.com
export PLANE_WORKSPACE_SLUG=your-workspace
```

`-g` installs the skill for all projects (`~/.claude/skills/`, for example); drop it
to install for the current project only.

## Other Ways to Install

The skill is the recommended path, but it is not the only one.

### Zero setup

plane-axi is an AXI, so any capable agent can run the CLI directly with nothing
installed at all. Just tell your agent:

```
Execute `npx -y plane-axi` to get Plane tools.
```

### Global install

```sh
npm install -g plane-axi
```

`PLANE_PROJECT` (an identifier like `LNKIN`) sets a default project so `--project`
can be omitted from every command.

## Usage

```bash
plane-axi                               # dashboard — every project, next commands
plane-axi projects                      # identifiers and names
plane-axi states --project LNKIN        # state names and groups

plane-axi issues --project LNKIN        # every issue, seq/title/state/priority
plane-axi issues --project LNKIN --state Todo
plane-axi issues --project LNKIN --priority urgent --limit 10

plane-axi issue view 110 --project LNKIN
plane-axi issue view 110 --project LNKIN --comments --full

plane-axi issue create --project LNKIN --title "Fix login" --priority high
plane-axi issue update 110 --project LNKIN --state "In Progress"
plane-axi issue close 110 --project LNKIN --comment "delivered"
plane-axi issue comment 110 "Looks good" --project LNKIN
```

### Commands

| Command | Purpose |
| --- | --- |
| *(none)* | Dashboard: every project plus the next commands to run |
| `projects` | Projects — identifiers and names |
| `states` | A project's states — names and groups |
| `issues` | List a project's issues; filter by state or priority |
| `issue view` | One issue with description, dates, and optional comments |
| `issue create` | Create with `--title`; state, priority, description optional |
| `issue update` | Change state, title, or priority |
| `issue close` | Move to a completed state; optional `--comment` |
| `issue comment` | Add a comment |

Every command takes `--help` for a concise reference with its flags and examples.

### Global flags

| Flag | Effect |
| --- | --- |
| `--json` | Raw API JSON — full field set, uuids included |
| `--help` | Print the command reference; always allowed, never reported as unknown |

`--project` is accepted by every command that needs one and takes the uuid, the
identifier (`LNKIN`), or the exact name.

## Behaviour worth relying on

- **Sequence IDs, not uuids.** Issues are addressed as `110` or `#110`; the CLI does
  the lookup. States take names (`Todo`, `Done`) or groups (`backlog`, `unstarted`,
  `started`, `completed`, `cancelled`).
- **Idempotent state changes.** `issue close` on an already-closed issue is a no-op
  with exit 0, so agents declare intent instead of reading first. A `--comment`
  given alongside is still added — commenting is separate intent.
- **Totals, not pages.** Lists fetch every page before filtering; `count: 32 of 219
  total` is definitive, and zero results say so explicitly instead of printing
  nothing.
- **Truncation with an escape hatch.** Descriptions cap at 500 chars with a
  `[...truncated]` marker; `--full` shows everything. Comments load only with
  `--comments`.
- **Fails loud.** An unknown flag exits 2 and lists that command's valid flags
  inline, so the agent corrects in one turn instead of making a `--help` call.
- **Clean channels.** Structured TOON on stdout, including errors — each with a
  `help:` block naming the fix. Exit codes: 0 success or no-op, 1 error, 2 usage.

## Development

```sh
npm install        # no-op — zero dependencies
npm test           # node:test, no framework, no network
node bin/plane-axi.js --help
```

## License

MIT
