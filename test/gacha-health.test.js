import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthServer } from '../src/health.js';
import { loadConfig } from '../src/config.js';
test('Configuration : identifiants Discord, port, base obligatoire et démo interdite en production', () => {
  const valid = { DISCORD_TOKEN: 'test-token', DISCORD_CLIENT_ID: '111111111111111111', DEMO_MODE: 'true' };
  assert.equal(loadConfig(valid).demo, true);
  assert.throws(() => loadConfig({ ...valid, DISCORD_CLIENT_ID: 'bad' }), /Application ID/);
  assert.throws(() => loadConfig({ ...valid, DISCORD_GUILD_ID: 'bad' }), /identifiant numérique/);
  assert.throws(() => loadConfig({ ...valid, PORT: '999999' }), /PORT/);
  assert.throws(() => loadConfig({ ...valid, DEMO_MODE: 'false' }), /DATABASE_URL/);
  assert.throws(() => loadConfig({ ...valid, NODE_ENV: 'production' }), /interdit/);
});
test('Railway : santé exige Discord prêt et PostgreSQL joignable, erreurs sans fuite de secrets', async () => {
  let ready = false, database = true;
  const server = createHealthServer({ isReady: () => ready, ping: async () => { if (!database) throw new Error('secret'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 503);
    ready = true; assert.equal((await fetch(`${base}/health`)).status, 200);
    database = false; const failed = await fetch(`${base}/health`); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /secret/);
    assert.equal((await fetch(`${base}/other`)).status, 404);
    assert.equal((await fetch(`${base}/health`, { method: 'POST' })).status, 404);
  } finally { await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }); }
});
