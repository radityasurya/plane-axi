// lib/cli.js — plane-axi implementation. Plain Node.js, no dependencies.
import { parseArgs } from 'node:util';

// Dying quietly on a closed stdout (e.g. `| head`) is a CLI basic.
process.stdout?.on?.('error', (e) => e.code === 'EPIPE' && process.exit(0));

const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'];
const HOME = process.env.HOME || '';

// ---------- output (TOON) ----------
const W = (s) => process.stdout.write(s + '\n');

function q(v, delim = ',') {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  const ambiguous = s === '' || s === 'null' || s === 'true' || s === 'false' || (s.trim() !== '' && !Number.isNaN(Number(s)));
  if (ambiguous || /["\n\r\t]/.test(s) || (delim && s.includes(delim)) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s).replace(/\\([bf])/g, (_, c) => (c === 'b' ? '\\u0008' : '\\u000c'));
  }
  return s;
}

function table(key, fields, rows) {
  W(`${key}[${rows.length}]{${fields.join(',')}}:`);
  for (const r of rows) W('  ' + fields.map((_, i) => q(r[i])).join(','));
}

function helpLines(lines) {
  if (!lines.length) return;
  W(`help[${lines.length}]:`);
  for (const l of lines) W('  ' + l);
}

function die(msg, hint, code = 1) {
  W(`error: ${msg}`);
  if (hint) helpLines(Array.isArray(hint) ? hint : [hint]);
  process.exit(code);
}

// ---------- html helpers ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text) => text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

function htmlToText(h) {
  return String(h || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- config & api ----------
function requireConfig() {
  const missing = ['PLANE_API_KEY', 'PLANE_BASE_URL', 'PLANE_WORKSPACE_SLUG'].filter((k) => !process.env[k]);
  if (missing.length) {
    die(`missing environment variable(s): ${missing.join(', ')}`,
      ['export PLANE_API_KEY=plane_api_...',
       'export PLANE_BASE_URL=https://your-plane.example.com',
       'export PLANE_WORKSPACE_SLUG=your-workspace'],
      2);
  }
  return {
    apiKey: process.env.PLANE_API_KEY,
    baseUrl: process.env.PLANE_BASE_URL.replace(/\/+$/, ''),
    slug: process.env.PLANE_WORKSPACE_SLUG,
  };
}

let CFG = null;

async function api(method, path, body, what) {
  let res;
  try {
    res = await fetch(`${CFG.baseUrl}/api/v1/workspaces/${CFG.slug}/${path}`, {
      method,
      headers: { 'X-API-Key': CFG.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    die(`cannot reach ${CFG.baseUrl}: ${e.cause?.code || e.message}`, 'Check PLANE_BASE_URL and your network connection.');
  }
  if (res.status === 403) die('authentication failed (403)', 'Check PLANE_API_KEY.');
  if (res.status === 404) die(`${what || path} not found (404)`);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error ?? ''; } catch {}
    die(`API error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.status === 204 ? null : res.json();
}

async function listAll(path, what) {
  const out = [];
  let cursor = '';
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const d = await api('GET', `${path}${sep}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, undefined, what);
    out.push(...(d.results || []));
    if (!d.next_page_results || !d.next_cursor) return { results: out, total: d.total_count ?? out.length };
    cursor = d.next_cursor;
  }
}

// ---------- cached lookups & resolvers ----------
const cache = {};
const getProjects = () => cache.projects ??= listAll('projects/', 'projects').then((r) => r.results);
const getStates = (pid) => cache['s:' + pid] ??= listAll(`projects/${pid}/states/`, 'states').then((r) => r.results);
const getIssues = (pid) => cache['i:' + pid] ??= listAll(`projects/${pid}/issues/`, 'issues').then((r) => r.results);

async function resolveProject(ref) {
  const projects = await getProjects();
  const r = ref.toLowerCase();
  const p = projects.find((x) => x.id === ref)
    || projects.find((x) => x.identifier.toLowerCase() === r)
    || projects.find((x) => x.name.toLowerCase() === r);
  if (!p) die(`project "${ref}" not found`, `Run 'plane-axi projects' to list projects.`);
  return p;
}

async function currentProject(flags) {
  const ref = flags.project || process.env.PLANE_PROJECT;
  const projects = await getProjects();
  if (ref) return resolveProject(ref);
  if (projects.length === 1) return projects[0];
  die('--project is required', [`Run 'plane-axi projects' to list projects, or set PLANE_PROJECT.`, `Use the UUID, identifier (LNKIN), or name.`], 2);
}

async function resolveState(pid, name) {
  const states = await getStates(pid);
  const r = name.toLowerCase();
  const s = states.find((x) => x.name.toLowerCase() === r) || states.find((x) => x.group === r);
  if (!s) die(`state "${name}" not found in this project`, `Run 'plane-axi states --project <project>' to list states.`);
  return s;
}

async function stateName(pid, uuid) {
  const states = await getStates(pid);
  return states.find((s) => s.id === uuid)?.name ?? uuid;
}

function parseSeq(s) {
  const n = Number(String(s ?? '').replace(/^#/, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function resolveIssue(pid, seqArg) {
  const seq = parseSeq(seqArg);
  if (!seq) die(`issue id must be a number like 110 or #110, got "${seqArg}"`, undefined, 2);
  const issues = await getIssues(pid);
  const i = issues.find((x) => x.sequence_id === seq);
  if (!i) die(`issue #${seq} not found in this project`, `Run 'plane-axi issues --project <project>' to list issues.`);
  return i;
}

// ---------- arg parsing ----------
const HELP = {
  issues: [
    'usage: plane-axi issues [--project <uuid|identifier|name>] [--state <name>] [--priority <p>] [--limit <n>] [--json]',
    'flags:',
    '  --project   project UUID, identifier (LNKIN), or name (default: $PLANE_PROJECT or sole project)',
    '  --state     state name (Todo, Done) or group (backlog, unstarted, started, completed, cancelled)',
    `  --priority  one of: ${PRIORITIES.join(', ')}`,
    '  --limit     show at most <n> issues',
    '  --json      print raw JSON instead of TOON',
    'examples:',
    `  plane-axi issues --project LNKIN --state Todo`,
    `  plane-axi issues --project LNKIN --priority urgent --limit 10`,
  ],
  view: [
    'usage: plane-axi issue view <seq-id> [--project <ref>] [--comments] [--full] [--json]',
    'flags:',
    '  --project   project the issue lives in (default: $PLANE_PROJECT or sole project)',
    '  --comments  also list comments',
    '  --full      skip description/comment truncation',
    '  --json      print raw JSON instead of TOON',
    'examples:',
    `  plane-axi issue view 110 --project LNKIN`,
    `  plane-axi issue view 110 --project LNKIN --comments --full`,
  ],
  create: [
    'usage: plane-axi issue create --title <text> [--project <ref>] [--state <name>] [--priority <p>] [--description <text>] [--json]',
    'flags:',
    '  --title        (required) issue title',
    '  --project      project to create in (default: $PLANE_PROJECT or sole project)',
    '  --state        state name or group (default: project default)',
    `  --priority     one of: ${PRIORITIES.join(', ')} (default: none)`,
    '  --description  plain text; blank lines separate paragraphs',
    '  --json         print raw JSON instead of TOON',
    'examples:',
    `  plane-axi issue create --project PERTA --title "Fix login" --priority high`,
    `  plane-axi issue create --project PERTA --title "Bug" --description "Steps:
  1. ..."`,
  ],
  update: [
    'usage: plane-axi issue update <seq-id> [--project <ref>] [--state <name>] [--title <text>] [--priority <p>] [--json]',
    'flags:',
    '  --project   project the issue lives in (default: $PLANE_PROJECT or sole project)',
    '  --state     new state name or group',
    '  --title     new title',
    `  --priority  one of: ${PRIORITIES.join(', ')}`,
    '  --json      print raw JSON instead of TOON',
    'examples:',
    `  plane-axi issue update 110 --project LNKIN --state "In Progress"`,
    `  plane-axi issue update 110 --project LNKIN --priority urgent --title "New title"`,
  ],
  close: [
    'usage: plane-axi issue close <seq-id> [--project <ref>] [--comment <text>] [--json]',
    'flags:',
    '  --project   project the issue lives in (default: $PLANE_PROJECT or sole project)',
    '  --comment   add this comment before closing',
    '  --json      print raw JSON instead of TOON',
    'examples:',
    `  plane-axi issue close 110 --project LNKIN --comment "delivered"`,
    `  plane-axi issue close 110 --project LNKIN`,
  ],
  comment: [
    'usage: plane-axi issue comment <seq-id> <text> [--project <ref>] [--json]',
    'flags:',
    '  --project   project the issue lives in (default: $PLANE_PROJECT or sole project)',
    '  --json      print raw JSON instead of TOON',
    'examples:',
    `  plane-axi issue comment 110 "Looks good" --project LNKIN`,
  ],
  projects: [
    'usage: plane-axi projects [--json]',
    'lists projects: identifier, name.',
  ],
  states: [
    'usage: plane-axi states [--project <ref>] [--json]',
    'lists states: name, group.',
  ],
};

function parse(cmd, argv, spec) {
  if (argv.includes('--help')) {
    W((HELP[cmd] || []).join('\n'));
    process.exit(0);
  }
  const options = {};
  for (const f of spec.string || []) options[f] = { type: 'string' };
  for (const f of spec.boolean || []) options[f] = { type: 'boolean' };
  try {
    return parseArgs({ args: argv, options, allowPositionals: true });
  } catch (e) {
    const m = /option '(-?-?[^']+)'|argument '(-?-?[^']+)'/.exec(e.message);
    const bad = m ? ` --${(m[1] || m[2]).replace(/^-+/, '')}` : '';
    const valid = [...(spec.string || []).map((f) => `--${f} <v>`), ...(spec.boolean || []).map((f) => `--${f}`), '--help'].join(', ');
    die(`unknown or malformed flag${bad} for '${cmd}'`, `valid flags: ${valid}`, 2);
  }
}

const raw = (v) => (v === undefined ? undefined : JSON.stringify(v, null, 2));

// ---------- commands ----------
async function home() {
  CFG = requireConfig();
  const projects = await getProjects();
  W(`bin: ${process.argv[1].replace(HOME, '~')}`);
  W(`description: Ergonomic CLI for the Plane project tracker (${CFG.baseUrl}, workspace ${CFG.slug})`);
  table('projects', ['identifier', 'name'], projects.map((p) => [p.identifier, p.name]));
  helpLines([
    `Run 'plane-axi issues --project <identifier>' to list issues`,
    `Run 'plane-axi issue view <seq> --project <identifier>' to read one issue`,
    `Run 'plane-axi --help' for all commands`,
  ]);
}

function topHelp() {
  W('usage: plane-axi <command> [flags]');
  W('commands[7]:');
  W('  issues                  list issues in a project');
  W('  issue view <seq>        read one issue (optionally with comments)');
  W('  issue create            create an issue (--title required)');
  W('  issue update <seq>      change state, title, or priority');
  W('  issue close <seq>       move to a completed state (--comment optional)');
  W('  issue comment <seq> <text>  comment on an issue');
  W('  projects | states       reference lists');
  W('env:');
  W('  PLANE_API_KEY, PLANE_BASE_URL, PLANE_WORKSPACE_SLUG (all required)');
  W('  PLANE_PROJECT (optional default for --project)');
  W('every command also takes --json for raw JSON and --help for details.');
}

async function cmdProjects(argv) {
  const { values: v } = parse('projects', argv, { boolean: ['json'] });
  CFG = requireConfig();
  const projects = await getProjects();
  if (v.json) return W(raw(projects));
  table('projects', ['identifier', 'name'], projects.map((p) => [p.identifier, p.name]));
  helpLines([`Run 'plane-axi issues --project <identifier>' to list its issues`]);
}

async function cmdStates(argv) {
  const { values: v } = parse('states', argv, { string: ['project'], boolean: ['json'] });
  CFG = requireConfig();
  const p = await currentProject(v);
  const states = await getStates(p.id);
  if (v.json) return W(raw(states));
  W(`project: ${p.identifier}`);
  table('states', ['name', 'group'], states.map((s) => [s.name, s.group]));
}

async function cmdIssues(argv) {
  const { values: v } = parse('issues', argv, { string: ['project', 'state', 'priority', 'limit'], boolean: ['json'] });
  CFG = requireConfig();
  const p = await currentProject(v);
  const [issues, states] = await Promise.all([getIssues(p.id), getStates(p.id)]);
  const nameOf = (uuid) => states.find((s) => s.id === uuid)?.name ?? 'unknown';

  let matched = issues;
  const filter = [];
  if (v.state) {
    const s = await resolveState(p.id, v.state);
    matched = matched.filter((i) => i.state === s.id);
    filter.push(`state: ${s.name}`);
  }
  if (v.priority) {
    const pr = v.priority.toLowerCase();
    if (!PRIORITIES.includes(pr)) die(`invalid priority "${v.priority}"`, `valid priorities: ${PRIORITIES.join(', ')}`, 2);
    matched = matched.filter((i) => (i.priority || 'none') === pr);
    filter.push(`priority: ${pr}`);
  }
  matched = [...matched].sort((a, b) => a.sequence_id - b.sequence_id);

  const total = issues.length;
  const context = `project ${p.identifier}${filter.length ? ` (${filter.join(', ')})` : ''}`;
  if (v.json) {
    return W(raw(v.limit ? matched.slice(0, Number(v.limit)) : matched));
  }
  if (!matched.length) return W(`issues: 0 issues match in ${context} (of ${total} total)`);

  const shown = v.limit ? Math.min(Number(v.limit), matched.length) : matched.length;
  W(`count: ${shown}${shown === matched.length ? '' : ` of ${matched.length} matching`} (of ${total} total in project ${p.identifier})`);
  table('issues', ['seq', 'name', 'state', 'priority'],
    matched.slice(0, shown).map((i) => [i.sequence_id, i.name, nameOf(i.state), i.priority || 'none']));
  const hints = [`Run 'plane-axi issue view <seq> --project ${p.identifier}' for details`];
  if (shown < matched.length) hints.unshift(`Run 'plane-axi issues --project ${p.identifier}${v.state ? ` --state "${v.state}"` : ''}' for all ${matched.length} matching issues`);
  helpLines(hints);
}

function truncate(text, max) {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)} [...truncated, ${text.length} chars total]`, truncated: true };
}

async function cmdIssueView(argv) {
  const { values: v, positionals } = parse('view', argv, { string: ['project'], boolean: ['comments', 'full', 'json'] });
  CFG = requireConfig();
  const p = await currentProject(v);
  const known = await resolveIssue(p.id, positionals[0]);
  const [issue, comments] = await Promise.all([
    api('GET', `projects/${p.id}/issues/${known.id}/`, undefined, `issue #${known.sequence_id}`),
    v.comments ? listAll(`projects/${p.id}/issues/${known.id}/comments/`, 'comments') : Promise.resolve(null),
  ]);

  if (v.json) {
    return W(comments ? raw({ issue, comments: comments.results }) : raw(issue));
  }

  const desc = htmlToText(issue.description_html);
  const d = v.full ? { text: desc, truncated: false } : truncate(desc, 500);
  const fields = [
    ['seq', issue.sequence_id],
    ['title', issue.name],
    ['state', await stateName(p.id, issue.state)],
    ['priority', issue.priority || 'none'],
    ['updated', (issue.updated_at || '').slice(0, 10)],
  ];
  if (comments) fields.push(['comments', comments.total]);
  fields.push(['description', d.text]);
  W('issue:');
  for (const [k, val] of fields) W(`  ${k}: ${typeof val === 'string' ? q(val, null) : val}`);

  const hints = [];
  if (d.truncated) hints.push(`Run 'plane-axi issue view ${issue.sequence_id} --project ${p.identifier} --full' for the full description`);
  if (!v.comments) hints.push(`Run 'plane-axi issue view ${issue.sequence_id} --project ${p.identifier} --comments' to include comments`);
  helpLines(hints);

  if (comments) {
    W(`comments[${comments.results.length}]{date,author,body}:`);
    for (const c of comments.results) {
      const body = v.full ? htmlToText(c.comment_html) : truncate(htmlToText(c.comment_html), 200).text;
      const author = c.actor_detail?.display_name ?? c.created_by ?? '';
      W(`  ${q((c.created_at || '').slice(0, 10))},${q(author)},${q(body)}`);
    }
  }
}

async function cmdIssueCreate(argv) {
  const { values: v } = parse('create', argv, { string: ['project', 'title', 'state', 'priority', 'description'], boolean: ['json'] });
  if (!v.title) die('--title is required', `Run 'plane-axi issue create --title "..." --project <ref>'`, 2);
  CFG = requireConfig();
  const p = await currentProject(v);
  const body = { name: v.title };
  if (v.description) body.description_html = toHtml(v.description);
  if (v.state) body.state = (await resolveState(p.id, v.state)).id;
  if (v.priority) {
    const pr = v.priority.toLowerCase();
    if (!PRIORITIES.includes(pr)) die(`invalid priority "${v.priority}"`, `valid priorities: ${PRIORITIES.join(', ')}`, 2);
    body.priority = pr;
  }
  const issue = await api('POST', `projects/${p.id}/issues/`, body, `project ${p.identifier}`);
  if (v.json) return W(raw(issue));
  W('issue:');
  W(`  seq: ${issue.sequence_id}`);
  W(`  title: ${q(issue.name ?? v.title, null)}`);
  W(`  state: ${issue.state ? await stateName(p.id, issue.state) : 'project default'}`);
  W(`  priority: ${issue.priority || 'none'}`);
  W(`  project: ${p.identifier}`);
  helpLines([`Run 'plane-axi issue view ${issue.sequence_id} --project ${p.identifier}' for details`]);
}

async function cmdIssueUpdate(argv) {
  const { values: v, positionals } = parse('update', argv, { string: ['project', 'state', 'title', 'priority'], boolean: ['json'] });
  if (!v.state && !v.title && !v.priority) {
    die('nothing to update', `Pass at least one of --state, --title, --priority. Run 'plane-axi issue update --help'.`, 2);
  }
  CFG = requireConfig();
  const p = await currentProject(v);
  const known = await resolveIssue(p.id, positionals[0]);
  const body = {};
  if (v.title) body.name = v.title;
  if (v.state) body.state = (await resolveState(p.id, v.state)).id;
  if (v.priority) {
    const pr = v.priority.toLowerCase();
    if (!PRIORITIES.includes(pr)) die(`invalid priority "${v.priority}"`, `valid priorities: ${PRIORITIES.join(', ')}`, 2);
    body.priority = pr;
  }
  const issue = await api('PATCH', `projects/${p.id}/issues/${known.id}/`, body, `issue #${known.sequence_id}`);
  if (v.json) return W(raw(issue));
  W('issue:');
  W(`  seq: ${issue.sequence_id ?? known.sequence_id}`);
  if (v.title) W(`  title: ${q(issue.name ?? v.title, null)}`);
  if (v.state) W(`  state: ${issue.state ? await stateName(p.id, issue.state) : v.state}`);
  if (v.priority) W(`  priority: ${issue.priority || 'none'}`);
  W(`  project: ${p.identifier}`);
}

async function cmdIssueClose(argv) {
  const { values: v, positionals } = parse('close', argv, { string: ['project', 'comment'], boolean: ['json'] });
  CFG = requireConfig();
  const p = await currentProject(v);
  const known = await resolveIssue(p.id, positionals[0]);

  if (v.comment) {
    await api('POST', `projects/${p.id}/issues/${known.id}/comments/`, { comment_html: toHtml(v.comment) }, `issue #${known.sequence_id}`);
    W(`comment: added to #${known.sequence_id}`);
  }

  const states = await getStates(p.id);
  const current = states.find((s) => s.id === known.state);
  if (current?.group === 'completed') {
    W(`issue: #${known.sequence_id} already closed (${current.name}, no-op)`);
    return;
  }
  const done = states.find((s) => s.group === 'completed');
  if (!done) die(`project ${p.identifier} has no completed state`, `Run 'plane-axi states --project ${p.identifier}' to see its states.`);
  const issue = await api('PATCH', `projects/${p.id}/issues/${known.id}/`, { state: done.id }, `issue #${known.sequence_id}`);
  if (v.json) return W(raw(issue));
  W('issue:');
  W(`  seq: ${known.sequence_id}`);
  W(`  state: ${done.name}`);
  W(`  project: ${p.identifier}`);
  if (v.comment) helpLines([`Comment and close applied to #${known.sequence_id}.`]);
}

async function cmdIssueComment(argv) {
  const { values: v, positionals } = parse('comment', argv, { string: ['project'], boolean: ['json'] });
  const [seq, ...words] = positionals;
  const text = words.join(' ');
  CFG = requireConfig();
  const p = await currentProject(v);
  if (!seq || !text) die('usage: plane-axi issue comment <seq-id> <text> [--project <ref>]', undefined, 2);
  const known = await resolveIssue(p.id, seq);
  const c = await api('POST', `projects/${p.id}/issues/${known.id}/comments/`, { comment_html: toHtml(text) }, `issue #${known.sequence_id}`);
  if (v.json) return W(raw(c));
  W(`comment: added to #${known.sequence_id} in ${p.identifier}`);
}

// ---------- dispatch ----------
const ISSUE_SUB = { view: cmdIssueView, create: cmdIssueCreate, update: cmdIssueUpdate, close: cmdIssueClose, comment: cmdIssueComment };

export async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd) return home();
  if (cmd === '--help' || cmd === 'help') return topHelp();

  const rest = argv.slice(cmd === 'issue' ? 2 : 1);
  try {
    if (cmd === 'projects') return await cmdProjects(rest);
    if (cmd === 'states') return await cmdStates(rest);
    if (cmd === 'issues') return await cmdIssues(rest);
    if (cmd === 'issue') {
      const sub = argv[1];
      if (!sub || !ISSUE_SUB[sub]) {
        die(`usage: plane-axi issue <subcommand> [flags]`,
          [`subcommands[5]: view <seq>, create, update <seq>, close <seq>, comment <seq> <text>`,
           `Run 'plane-axi issue <subcommand> --help' for details`], 2);
      }
      return await ISSUE_SUB[sub](rest);
    }
    die(`unknown command '${cmd}'`, `Run 'plane-axi --help' to see available commands`, 2);
  } catch (e) {
    die(e.message || String(e), undefined, 1);
  }
}

// exported for tests
export const _internals = { q, table, htmlToText, toHtml, truncate, parseSeq, PRIORITIES };
