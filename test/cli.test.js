import { test } from 'node:test';
import assert from 'node:assert/strict';
import { q, table, detail, help, timeAgo, stripHtml, truncBody } from '../lib/cli.js';

test('q quotes only when needed', () => {
  assert.equal(q('plain'), 'plain');
  assert.equal(q('a,b'), '"a,b"');
  assert.equal(q('say "hi"'), '"say ""hi"""');
  assert.equal(q(null), '');
});

test('table renders TOON rows', () => {
  assert.deepEqual(table('issues', ['seq', 'title'], [{ seq: 1, title: 'Fix' }, { seq: 2, title: 'a,b' }]), [
    'issues[2]{seq,title}:',
    '  1,Fix',
    '  2,"a,b"',
  ]);
});

test('detail indents key-value pairs', () => {
  assert.deepEqual(detail('issue', [['seq', '#9'], ['title', 'x,y']]), ['issue:', '  seq: #9', '  title: "x,y"']);
});

test('help lists lines with count', () => {
  assert.deepEqual(help(['a', 'b']), ['help[2]:', '  a', '  b']);
  assert.deepEqual(help([]), []);
});

test('timeAgo buckets', () => {
  const now = Date.parse('2025-01-10T00:00:00Z');
  assert.equal(timeAgo('2025-01-10T00:00:10Z', now), 'just now');
  assert.equal(timeAgo('2025-01-09T23:30:00Z', now), '30m ago');
  assert.equal(timeAgo('2025-01-09T10:00:00Z', now), '14h ago');
  assert.equal(timeAgo('2025-01-01T00:00:00Z', now), '9d ago');
});

test('stripHtml converts description_html to text', () => {
  assert.equal(stripHtml('<p>a &amp; b</p><p>c</p>'), 'a & b\nc');
});

test('truncBody marks long text and reports total', () => {
  const { text, note } = truncBody('x'.repeat(1500), 1000);
  assert.equal(text.length, 1000);
  assert.match(note, /truncated, 1500 chars total/);
  assert.equal(truncBody('short').note, null);
});
