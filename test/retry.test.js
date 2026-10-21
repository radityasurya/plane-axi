// The 429 retry in api(). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PLANE_AXI_RETRY_BASE_MS = '1'; // before the import reads it
const { _internals } = await import('../lib/cli.js');
const { api, retryDelay, setConfig } = _internals;

const reply = (status, body = {}, headers = {}) => ({
  status, ok: status < 400, headers: new Headers(headers), json: async () => body,
});

test('api retries a 429 and returns the next answer', async () => {
  setConfig({ baseUrl: 'https://plane.test', slug: 'ws', apiKey: 'k' });
  const answers = [reply(429), reply(429), reply(200, { ok: 1 })];
  let calls = 0;
  globalThis.fetch = async () => answers[calls++];
  assert.deepEqual(await api('GET', 'projects/'), { ok: 1 });
  assert.equal(calls, 3);
});

test('retryDelay prefers Retry-After, else backs off', () => {
  assert.equal(retryDelay(reply(429, {}, { 'retry-after': '7' }), 0), 7000);
  assert.equal(retryDelay(reply(429), 0), 1);
  assert.equal(retryDelay(reply(429), 3), 8);
});
