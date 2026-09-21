// Unit tests for plane-axi internals. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _internals } from '../lib/cli.js';

const { q, htmlToText, toHtml, truncate, parseSeq } = _internals;

test('q quotes what TOON requires', () => {
  assert.equal(q('plain'), 'plain');
  assert.equal(q('has,comma'), '"has,comma"');
  assert.equal(q('has "quote"'), '"has \\"quote\\""');
  assert.equal(q('multi\nline'), '"multi\\nline"');
  assert.equal(q(''), '""');
  assert.equal(q('123'), '"123"'); // numeric-looking string must not decode as number
  assert.equal(q('null'), '"null"');
  assert.equal(q(5), '5');
  assert.equal(q(null), 'null');
  assert.equal(q('trailing '), '"trailing "');
  // no delimiter in object fields: comma stays bare
  assert.equal(q('a,b', null), 'a,b');
});

test('htmlToText strips tags and decodes entities', () => {
  assert.equal(htmlToText('<p>a &amp; b</p><p>c&lt;d</p>'), 'a & b\nc<d');
  assert.equal(htmlToText('<ul><li>x</li><li>y</li></ul>'), '- x\n- y');
  assert.equal(htmlToText(null), '');
  assert.equal(htmlToText('plain'), 'plain');
});

test('toHtml round-trips through htmlToText', () => {
  const src = 'line one\nline two\n\npara two, with <angle> & amp';
  assert.equal(htmlToText(toHtml(src)), 'line one\nline two\npara two, with <angle> & amp');
});

test('truncate marks and reports', () => {
  assert.deepEqual(truncate('short', 10), { text: 'short', truncated: false });
  const r = truncate('x'.repeat(600), 500);
  assert.equal(r.truncated, true);
  assert.match(r.text, /\[\.\.\.truncated, 600 chars total\]$/);
});

test('parseSeq accepts #110 and rejects junk', () => {
  assert.equal(parseSeq('#110'), 110);
  assert.equal(parseSeq('110'), 110);
  assert.equal(parseSeq('abc'), null);
  assert.equal(parseSeq('-5'), null);
  assert.equal(parseSeq(undefined), null);
});
