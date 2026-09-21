// plane-axi CLI — no dependencies, node:fetch only.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { VERSION } from './version.js';

export { VERSION };

// ---------- output (TOON) ----------

export function q(v) {
  if (v === null || v === undefined) v = '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function table(name, fields, rows) {
  const lines = [`${name}[${rows.length}]{${fields.join(',')}}:`];
  for (const r of rows) lines.push('  ' + fields.map((f) => q(r[f])).join(','));
  return lines;
}

export function detail(name, pairs) {
  const lines = [`${name}:`];
  for (const [k, v] of pairs) lines.push(`  ${k}: ${/[\n,]/.test(String(v)) ? q(v) : v}`);
  return lines;
}

export function help(lines) {
  return lines.length ? [`help[${lines.length}]:`, ...lines.map((l) => '  ' + l)] : [];
}

export function timeAgo(iso, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d ago`;
  const mo = d / 30;
  if (mo < 12) return `${Math.floor(mo)}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export const BODY_LIMIT = 1000;

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|pre|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function truncBody(text, limit = BODY_LIMIT) {
  const t = String(text ?? '');
  if (t.length <= limit) return { text: t, note: null };
  return {
    text: t.slice(0, limit),
    note: `... (truncated, ${t.length} chars total - use --full to see complete description)`,
  };
}

// ---------- env + api ----------

const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low', 'none']);

function env() {
  const e = {
    key: process.env.PLANE_API_KEY,
    base: process.env.PLANE_BASE_URL,
    slug: process.env.PLANE_WORKSPACE_SLUG,
  };
  const want = { key: 'PLANE_API_KEY', base: 'PLANE_BASE_URL', slug: 'PLANE_WORKSPACE_SLUG' };
  const miss = Object.entries(want).filter(([k]) => !e[k]).map(([, n]) => n);
  if (miss.length) fail(`missing environment variable${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}`, 'ENV_MISSING', [
    'export PLANE_API_KEY=plane_api_...',
    'export PLANE_BASE_URL=https://your-plane.example.com',
    'export PLANE_WORKSPACE_SLUG=your-workspace',
  ]);
  return { ...e, api: `${e.base.replace(/\/$/, '')}/api/v1/workspaces/${e.slug}` };
}

async function api(path, { method = 'GET', body } = {}, ctx){
  const url = `${ctx.api}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'X-API-Key': ctx.key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    fail(`cannot reach ${ctx.base}: ${err.cause?.code || err.message}`, 'NETWORK', [`Check that ${ctx.base} is up and reachable`]);
  }
  if (!res.ok) {
    let detailTxt = '';
    try { detailTxt = (await res.json())?.error?.message || ''; } catch {}
    if (res.status === 401) fail('invalid API key (401)', 'AUTH', ['Check PLANE_API_KEY — it must be a valid key for this Plane instance']);
    if (res.status === 403) fail(`forbidden (403)${detailTxt ? ': ' + detailTxt : ''}`, 'FORBIDDEN', ['The API key lacks access to this workspace or endpoint']);
    if (res.status === 404) fail(`not found (404): ${path.split('?')[0]}`, 'NOT_FOUND', ['Check the project, issue, or state you referenced']);
    fail(`Plane API error ${res.status}${detailTxt ? ': ' + detailTxt : ''}`, 'API_ERROR', [`Plane returned ${res.status} for ${path.split('?')[0]}`]);
  }
  return res.json();
}

// paged GET that follows cursor pagination and returns all results
async function apiAll(path, ctx) {
  let out = [], cursor = null;
  do {
    const j = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, {}, ctx);
    out.push(...(j.results || []));
    cursor = j.next_cursor && j.next_page_results ? j.next_cursor : null;
  } while (cursor);
  return out;
}

// ---------- resolvers ----------

async function getProjects(ctx) {
  return apiAll('/projects/', ctx);
}

async function resolveProject(ctx, flagVal) {
  const projects = await getProjects(ctx);
  const want = (flagVal ?? ctx.project ?? '').trim().toLowerCase();
  if (!want) {
    if (projects.length === 1) return projects[0];
    fail(`--project is required (${projects.length} projects in this workspace)`, 'PROJECT_REQUIRED', [
      'Pass --project <UUID|identifier|name>, e.g. --project LNKIN',
      'Run `plane-axi projects` to list projects',
      'Or export PLANE_PROJECT to set a default',
    ], 2);
  }
  const p = projects.find(
    (x) => x.id === flagVal?.trim() || x.identifier.toLowerCase() === want || x.name.toLowerCase() === want
  );
  if (!p) fail(`no project matches "${flagVal}"`, 'NO_PROJECT', [
    'Run `plane-axi projects` to see identifiers and names',
  ]);
  return p;
}

async function getStates(ctx, projectId) {
  return apiAll(`/projects/${projectId}/states/`, ctx);
}

// resolve a state name (or group: backlog/unstarted/started/completed/cancelled) to matching state UUIDs
async function resolveStates(ctx, projectId, name) {
  const states = await getStates(ctx, projectId);
  const want = String(name).toLowerCase();
  const byName = states.filter((s) => s.name.toLowerCase() === want);
  const hits = byName.length ? byName : states.filter((s) => s.group.toLowerCase() === want);
  if (!hits.length) fail(`no state matches "${name}" in this project`, 'NO_STATE', [
    'Run `plane-axi states --project <project>` to see state names',
  ]);
  return { states, ids: new Set(hits.map((s) => s.id)), first: hits[0] };
}

async function getIssues(ctx, projectId) {
  return apiAll(`/projects/${projectId}/issues/`, ctx);
}

async function resolveIssue(ctx, projectId, seqRef, issues) {
  const seq = Number(String(seqRef).replace(/^#/, ''));
  if (!Number.isInteger(seq)) fail(`"${seqRef}" is not a sequence ID`, 'BAD_SEQ', ['Use the issue number, e.g. 110 or #110'], 2);
  const list = issues ?? (await getIssues(ctx, projectId));
  const issue = list.find((i) => i.sequence_id === seq);
  if (!issue) fail(`#${seq} does not exist in this project`, 'NOT_FOUND', [
    'Run `plane-axi issues --project <project>` to list issue numbers',
  ]);
  return { issue, issues: list };
}

// ---------- errors ----------

export function fail(msg, code, helpLines = [], code2 = 1) {
  console.log(`error: ${/[\n,]/.test(msg) ? q(msg) : msg}`);
  if (code) console.log(`code: ${code}`);
  for (const l of help(helpLines)) console.log(l);
  process.exit(code2);
}

function usageError(cmd, msg, validFlags) {
  const lines = [`Valid flags for \`${cmd}\`: ${validFlags.map((f) => `--${f}`).join(', ')}`, 'Run `plane-axi ' + cmd + ' --help` for examples'];
  fail(msg, 'USAGE', lines, 2);
}

// ---------- command definitions ----------

const GLOBAL_FLAGS = ['json', 'help'];

const COMMANDS = {
  '': { desc: 'show projects (home view)' },
  projects: { desc: 'list projects' },
  states: { flags: ['project'], desc: 'list states of a project' },
  issues: {
    flags: ['project', 'state', 'priority', 'limit', 'fields'],
    desc: 'list issues',
  },
  issue: {
    sub: {
      view: { args: '<seq-id>', flags: ['project', 'full'], desc: 'show one issue' },
      create: { flags: ['project', 'title', 'state', 'priority', 'description'], desc: 'create an issue', require: ['title'] },
      update: { args: '<seq-id>', flags: ['project', 'state', 'title', 'priority'], desc: 'update an issue' },
      close: { args: '<seq-id>', flags: ['project', 'comment'], desc: 'close an issue' },
      comment: { args: '<seq-id> <text>', flags: ['project'], desc: 'comment on an issue' },
    },
  },
};

const HELP_TEXT = {
  projects: `usage: plane-axi projects [--json]
Lists all projects: id, identifier, name.`,
  states: `usage: plane-axi states [--project <UUID|identifier|name>]
Lists states: name, group, id.
--project defaults to $PLANE_PROJECT.`,
  issues: `usage: plane-axi issues [--project P] [--state NAME] [--priority p] [--limit N] [--fields f1,f2] [--json]
  --state     state name ("Todo") or group (backlog, unstarted, started, completed, cancelled)
  --priority  urgent, high, medium, low, none
  --limit     show first N after filtering (default: all)
  --fields    extra fields: id, assignees, labels, updated, created
examples:
  plane-axi issues --project LNKIN --state Todo
  plane-axi issues --project LNKIN --priority high --limit 10`,
  view: `usage: plane-axi issue view <seq-id> [--project P] [--full] [--json]
Shows one issue with truncated description; --full shows all of it.`,
  create: `usage: plane-axi issue create --title "..." [--project P] [--state NAME] [--priority p] [--description "text"]
  --state defaults to the project's first backlog/unstarted state.
example:
  plane-axi issue create --project PERTA --title "Fix login" --priority high`,
  update: `usage: plane-axi issue update <seq-id> [--project P] [--state NAME] [--title "..."] [--priority p]`,
  close: `usage: plane-axi issue close <seq-id> [--project P] [--comment "text"]
Idempotent: closing an already-closed issue is a no-op (exit 0).`,
  comment: `usage: plane-axi issue comment <seq-id> <text> [--project P]`,
};

// ---------- formatting ----------

function renderIssueRow(i, stateNames, extra) {
  const row = { seq: i.sequence_id, title: i.name, state: stateNames.get(i.state) || i.state.slice(0, 8), priority: i.priority };
  if (extra) {
    if (extra.includes('id')) row.id = i.id;
    if (extra.includes('assignees')) row.assignees = (i.assignees || []).length;
    if (extra.includes('labels')) row.labels = (i.labels || []).length;
    if (extra.includes('updated')) row.updated = timeAgo(i.updated_at);
    if (extra.includes('created')) row.created = timeAgo(i.created_at);
  }
  return row;
}

function printIssueList(ctx, issues, stateNames, totalCount, extraFields) {
  if (ctx.json) {
    console.log(JSON.stringify(issues.map((i) => ({ seq: i.sequence_id, title: i.name, state: stateNames.get(i.state) || i.state, priority: i.priority, id: i.id })), null, 2));
    return;
  }
  if (!issues.length) {
    console.log(`issues: 0 issues found${ctx.stateFilter ? ` (state: ${ctx.stateFilter})` : ''}${ctx.priorityFilter ? ` (priority: ${ctx.priorityFilter})` : ''} in ${ctx.projectRef}`);
    return;
  }
  console.log(`count: ${issues.length}${totalCount != null ? ` of ${totalCount} total` : ''}`);
  const fields = ['seq', 'title', 'state', 'priority', ...(extraFields || [])];
  for (const l of table('issues', fields, issues.map((i) => renderIssueRow(i, stateNames, extraFields)))) console.log(l);
  const hints = [];
  if (extraFields?.length) hints.push(`Run 'plane-axi issues --project ${ctx.projectRef}' for the default fields`);
  hints.push(`Run 'plane-axi issue view <seq> --project ${ctx.projectRef}' to see details`);
  for (const l of help(hints)) console.log(l);
}

async function printIssueDetail(ctx, issue, states) {
  const stateNames = new Map(states.map((s) => [s.id, s.name]));
  const body = stripHtml(issue.description_html);
  const t = ctx.full ? { text: body, note: null } : truncBody(body);
  if (ctx.json) {
    console.log(JSON.stringify({ seq: issue.sequence_id, title: issue.name, state: stateNames.get(issue.state), priority: issue.priority, id: issue.id, description: t.note ? t.text + t.note : body }, null, 2));
    return;
  }
  const pairs = [
    ['seq', `#${issue.sequence_id}`],
    ['title', issue.name],
    ['state', stateNames.get(issue.state) || issue.state],
    ['priority', issue.priority],
    ['id', issue.id],
    ['updated', timeAgo(issue.updated_at)],
    ['description', t.text],
  ];
  for (const l of detail('issue', pairs)) console.log(l);
  if (t.note) console.log('    ' + t.note);
}

// ---------- command handlers ----------

function parse(argv, cmdPath, flags, nPositionals) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        project: { type: 'string' }, state: { type: 'string' }, priority: { type: 'string' },
        limit: { type: 'string' }, fields: { type: 'string' }, title: { type: 'string' },
        description: { type: 'string' }, comment: { type: 'string' },
        full: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean' },
      },
      allowPositionals: true,
    });
  } catch (err) {
    const m = err.message.match(/--([\w-]+)/);
    usageError(cmdPath, m ? `unknown flag --${m[1]} for \`${cmdPath}\`` : err.message, flags);
  }
  const unknown = Object.keys(parsed.values).filter((k) => ![...flags, ...GLOBAL_FLAGS].includes(k));
  if (unknown.length) usageError(cmdPath, `unknown flag --${unknown[0]} for \`${cmdPath}\``, flags);
  const pos = parsed.positionals;
  if (pos.length < nPositionals) fail(`missing ${nPositionals - pos.length} positional argument${nPositionals - pos.length > 1 ? 's' : ''} for \`${cmdPath}\``, 'USAGE', [HELP_TEXT[cmdPath.split(' ').pop()]?.split('\n')[0] || `Run \`plane-axi ${cmdPath} --help\``], 2);
  if (pos.length > nPositionals) fail(`unexpected argument "${pos[nPositionals]}" for \`${cmdPath}\` (expected ${nPositionals})`, 'USAGE', [`Run \`plane-axi ${cmdPath} --help\` for usage`], 2);
  return { values: parsed.values, pos };
}

async function cmdProjects(ctx) {
  const projects = await getProjects(ctx);
  if (ctx.json) return console.log(JSON.stringify(projects.map((p) => ({ id: p.id, identifier: p.identifier, name: p.name })), null, 2));
  console.log(`count: ${projects.length}`);
  for (const l of table('projects', ['identifier', 'name', 'id'], projects.map((p) => ({ identifier: p.identifier, name: p.name, id: p.id })))) console.log(l);
  for (const l of help([
    'Run `plane-axi issues --project <identifier>` to list issues',
    'Run `plane-axi states --project <identifier>` to list states',
  ])) console.log(l);
}

async function cmdStates(ctx, values) {
  const p = await resolveProject(ctx, values.project);
  const states = await getStates(ctx, p.id);
  if (ctx.json) return console.log(JSON.stringify(states.map((s) => ({ name: s.name, group: s.group, id: s.id })), null, 2));
  for (const l of table('states', ['name', 'group', 'id'], states.map((s) => ({ name: s.name, group: s.group, id: s.id })))) console.log(l);
}

async function cmdIssues(ctx, values) {
  if (values.priority && !PRIORITIES.has(values.priority.toLowerCase()))
    fail(`invalid priority "${values.priority}"`, 'USAGE', [`Valid priorities: ${[...PRIORITIES].join(', ')}`], 2);
  const p = await resolveProject(ctx, values.project);
  ctx.projectRef = values.project ?? ctx.project ?? p.identifier;
  const states = await getStates(ctx, p.id);
  const stateNames = new Map(states.map((s) => [s.id, s.name]));
  let issues = await getIssues(ctx, p.id);
  const total = issues.length;
  if (values.state) {
    ctx.stateFilter = values.state;
    const { ids } = await resolveStates(ctx, p.id, values.state);
    issues = issues.filter((i) => ids.has(i.state));
  }
  if (values.priority) {
    ctx.priorityFilter = values.priority.toLowerCase();
    issues = issues.filter((i) => i.priority === values.priority.toLowerCase());
  }
  const extra = values.fields ? values.fields.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const bad = extra.filter((f) => !['id', 'assignees', 'labels', 'updated', 'created'].includes(f));
  if (bad.length) fail(`unknown field "${bad[0]}"`, 'USAGE', ['Valid extra fields: id, assignees, labels, updated, created'], 2);
  if (values.limit) {
    const n = Number(values.limit);
    if (!Number.isInteger(n) || n < 1) fail(`invalid --limit "${values.limit}"`, 'USAGE', ['--limit must be a positive integer'], 2);
    issues = issues.slice(0, n);
  }
  printIssueList(ctx, issues, stateNames, total, extra);
}

async function cmdView(ctx, values, pos) {
  const p = await resolveProject(ctx, values.project);
  const { issue } = await resolveIssue(ctx, p.id, pos[0]);
  const states = await getStates(ctx, p.id);
  ctx.full = values.full;
  await printIssueDetail(ctx, issue, states);
}

async function cmdCreate(ctx, values) {
  if (!values.title) fail('--title is required', 'USAGE', ['plane-axi issue create --title "..." [--project P] [--state NAME] [--priority p] [--description "text"]'], 2);
  if (values.priority && !PRIORITIES.has(values.priority.toLowerCase()))
    fail(`invalid priority "${values.priority}"`, 'USAGE', [`Valid priorities: ${[...PRIORITIES].join(', ')}`], 2);
  const p = await resolveProject(ctx, values.project);
  const states = await getStates(ctx, p.id);
  const body = { name: values.title };
  if (values.description) body.description_html = `<p>${values.description.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`;
  if (values.priority) body.priority = values.priority.toLowerCase();
  if (values.state) body.state = (await resolveStates(ctx, p.id, values.state)).first.id;
  else {
    const def = states.find((s) => s.group === 'backlog') || states.find((s) => s.group === 'unstarted') || states[0];
    if (def) body.state = def.id;
  }
  const created = await api(`/projects/${p.id}/issues/`, { method: 'POST', body }, ctx);
  const stateNames = new Map(states.map((s) => [s.id, s.name]));
  if (ctx.json) return console.log(JSON.stringify({ seq: created.sequence_id, title: created.name, state: stateNames.get(created.state), priority: created.priority, id: created.id }, null, 2));
  for (const l of detail('created', [
    ['seq', `#${created.sequence_id}`], ['title', created.name],
    ['state', stateNames.get(created.state) || created.state], ['priority', created.priority], ['project', p.identifier], ['id', created.id],
  ])) console.log(l);
  for (const l of help([`Run 'plane-axi issue view ${created.sequence_id} --project ${p.identifier}' to see it`])) console.log(l);
}

async function cmdUpdate(ctx, values, pos) {
  if (!values.state && !values.title && !values.priority) fail('nothing to update: pass --state, --title, or --priority', 'USAGE', ['plane-axi issue update <seq-id> --state Done --project P'], 2);
  if (values.priority && !PRIORITIES.has(values.priority.toLowerCase()))
    fail(`invalid priority "${values.priority}"`, 'USAGE', [`Valid priorities: ${[...PRIORITIES].join(', ')}`], 2);
  const p = await resolveProject(ctx, values.project);
  const { issue } = await resolveIssue(ctx, p.id, pos[0]);
  const body = {};
  if (values.title) body.name = values.title;
  if (values.priority) body.priority = values.priority.toLowerCase();
  if (values.state) body.state = (await resolveStates(ctx, p.id, values.state)).first.id;
  const updated = await api(`/projects/${p.id}/issues/${issue.id}/`, { method: 'PATCH', body }, ctx);
  const states = await getStates(ctx, p.id);
  const stateNames = new Map(states.map((s) => [s.id, s.name]));
  if (ctx.json) return console.log(JSON.stringify({ seq: updated.sequence_id, title: updated.name, state: stateNames.get(updated.state), priority: updated.priority }, null, 2));
  for (const l of detail('updated', [
    ['seq', `#${updated.sequence_id}`], ['title', updated.name],
    ['state', stateNames.get(updated.state) || updated.state], ['priority', updated.priority],
  ])) console.log(l);
}

async function cmdClose(ctx, values, pos) {
  const p = await resolveProject(ctx, values.project);
  const { issue } = await resolveIssue(ctx, p.id, pos[0]);
  const states = await getStates(ctx, p.id);
  const doneStates = states.filter((s) => s.group === 'completed');
  if (!doneStates.length) fail('this project has no completed state to close into', 'NO_STATE', ['Run `plane-axi states --project <project>` to see states']);
  const inDone = doneStates.some((s) => s.id === issue.state);
  const stateNames = new Map(states.map((s) => [s.id, s.name]));
  let commented = false;
  if (values.comment) {
    await api(`/projects/${p.id}/issues/${issue.id}/comments/`, { method: 'POST', body: { comment_html: values.comment } }, ctx);
    commented = true;
  }
  if (inDone) {
    if (ctx.json) return console.log(JSON.stringify({ seq: issue.sequence_id, state: stateNames.get(issue.state), noop: true, commented }));
    for (const l of detail('issue', [
      ['seq', `#${issue.sequence_id}`],
      ['state', `${stateNames.get(issue.state)} (already closed - no-op)`],
      ...(commented ? [['comment', 'added']] : []),
    ])) console.log(l);
    return;
  }
  const target = doneStates.slice().sort((a, b) => a.sequence - b.sequence)[0];
  const updated = await api(`/projects/${p.id}/issues/${issue.id}/`, { method: 'PATCH', body: { state: target.id } }, ctx);
  if (ctx.json) return console.log(JSON.stringify({ seq: updated.sequence_id, state: stateNames.get(updated.state), commented }));
  for (const l of detail('closed', [
    ['seq', `#${updated.sequence_id}`], ['title', updated.name],
    ['state', stateNames.get(updated.state) || updated.state],
    ...(commented ? [['comment', 'added']] : []),
  ])) console.log(l);
}

async function cmdComment(ctx, values, pos) {
  const p = await resolveProject(ctx, values.project);
  const { issue } = await resolveIssue(ctx, p.id, pos[0]);
  const text = pos[1];
  const created = await api(`/projects/${p.id}/issues/${issue.id}/comments/`, { method: 'POST', body: { comment_html: text } }, ctx);
  if (ctx.json) return console.log(JSON.stringify({ seq: issue.sequence_id, comment_id: created.id }));
  for (const l of detail('commented', [
    ['seq', `#${issue.sequence_id}`], ['comment_id', created.id], ['text', truncBody(text, 200).text],
  ])) console.log(l);
}

// ---------- dispatch ----------

export async function main() {
  const argv = process.argv.slice(2);
  const [cmd, sub] = argv;

  if (!cmd || cmd === '--help' || cmd === '-h') {
    const bin = process.argv[1].replace(homedir(), '~');
    console.log(`bin: ${bin}`);
    console.log('description: Ergonomic CLI for the Plane project tracker (workspace from $PLANE_WORKSPACE_SLUG)');
    console.log(`version: ${VERSION}`);
    await cmdProjects({ ...envFromArgv(argv), project: process.env.PLANE_PROJECT });
    console.log('commands[7]:');
    for (const [c, d] of Object.entries([
      ['projects', 'list projects'], ['states --project P', 'list states'],
      ['issues --project P', 'list issues'], ['issue view <seq>', 'show one issue'],
      ['issue create --title "..."', 'create an issue'], ['issue close <seq>', 'close an issue'],
      ['issue update <seq> / issue comment <seq> <text>', 'update or comment'],
    ])) console.log(`  ${c.padEnd(42)} ${d}`);
    return;
  }

  if (cmd === 'projects') return runSimple('projects', argv, 0, cmdProjects);
  if (cmd === 'states') return runSimple('states', argv, 0, cmdStates);
  if (cmd === 'issues') return runSimple('issues', argv, 0, cmdIssues);
  if (cmd === 'issue' && sub && COMMANDS.issue.sub[sub]) {
    const def = COMMANDS.issue.sub[sub];
    const rest = argv.slice(2);
    if (rest.includes('--help') || rest.includes('-h')) return console.log(HELP_TEXT[sub]);
    const nPos = sub === 'comment' ? 2 : sub === 'view' || sub === 'update' || sub === 'close' ? 1 : 0;
    const { values, pos } = parse(rest, `issue ${sub}`, def.flags, nPos);
    if (def.require?.includes('title') && !values.title)
      fail('--title is required', 'USAGE', [HELP_TEXT[sub].split('\n')[0]], 2);
    const ctx = { ...envFromArgv(rest), project: process.env.PLANE_PROJECT };
    const fn = { view: cmdView, create: cmdCreate, update: cmdUpdate, close: cmdClose, comment: cmdComment }[sub];
    return fn(ctx, values, pos);
  }
  fail(`unknown command: ${cmd}${sub ? ' ' + sub : ''}`, 'USAGE', [
    'Run `plane-axi --help` to see available commands',
  ]);
}

function envFromArgv(args) {
  const json = args.includes('--json');
  const ctx = env();
  ctx.json = json;
  return ctx;
}

async function runSimple(name, argv, nPos, fn) {
  const def = COMMANDS[name];
  const rest = argv.slice(1);
  if (rest.includes('--help') || rest.includes('-h')) return console.log(HELP_TEXT[name]);
  const { values, pos } = parse(rest, name, def.flags, nPos);
  const ctx = { ...envFromArgv(rest), project: process.env.PLANE_PROJECT };
  return fn(ctx, values, pos);
}
