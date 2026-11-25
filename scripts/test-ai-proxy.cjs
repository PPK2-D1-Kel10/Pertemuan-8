const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { once } = require('node:events');

test('merged Gemini proxy authenticates owner, uses stored reason, and only writes AI fields', async () => {
  const records = {
    'permissions/perm_student': { studentId: 'student', assistantId: 'assistant', reason: 'Alasan asli di database', status: 'Menunggu Pemeriksaan' },
    'users/assistant': { role: 'Asisten' },
    'users/otherAssistant': { role: 'Asisten' },
  };
  const sentReasons = [];
  const updates = [];
  const db = {
    doc: key => ({ key, get: async () => ({ exists: !!records[key], data: () => records[key] }) }),
    runTransaction: work => work({ get: ref => ref.get(), update: (ref, value) => { updates.push(value); Object.assign(records[ref.key], value); } }),
  };
  const module = { exports: {} };
  const testRequire = name => {
    if (name === 'node:fs') return { existsSync: () => false }; // Never read real environment or credentials.
    if (name.endsWith('firebase-admin/app')) return { initializeApp: () => ({}), applicationDefault: () => ({}) };
    if (name.endsWith('firebase-admin/auth')) return { getAuth: () => ({ verifyIdToken: async token => { if (['student', 'assistant', 'otherAssistant'].includes(token)) return { uid: token }; throw new Error('Invalid'); } }) };
    if (name.endsWith('firebase-admin/firestore')) return { getFirestore: () => db };
    return require(name);
  };
  const fakeFetch = async (url, options) => {
    assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'));
    if (url.includes('/models?')) return { ok: true, json: async () => ({ models: [{ name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }] }) };
    const body = JSON.parse(options.body);
    if (body.contents[0].parts[0].text !== 'OK') sentReasons.push(body.contents[0].parts[0].text);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ category: 'Sakit', confidence: .9, explanation: 'Perlu diperiksa.' }) }] } }] }) };
  };
  const file = path.resolve('scripts/ai-proxy-server.cjs');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: testRequire, module, __dirname: path.dirname(file), process: { env: { GEMINI_API_KEY: 'fake-test-key', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-test' }, uptime: () => 1 },
    fetch: fakeFetch, console, Buffer, AbortController, setTimeout, clearTimeout,
  }, { filename: file });
  const server = module.exports;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (token, data = { reason: 'Forged reason from client', leaveId: 'perm_student' }, origin) => fetch(`${base}/api/classify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data),
  });
  try {
    assert.equal((await call()).status, 401);
    assert.equal((await call('bad')).status, 401);
    assert.equal((await call('otherAssistant')).status, 403);
    assert.equal((await call('student', { reason: 'x', leaveId: '../users/admin' })).status, 400);
    assert.equal((await call('student', undefined, 'https://untrusted.example')).status, 403);
    for (const token of ['student', 'assistant']) {
      const response = await call(token);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).persistedByBackend, true);
    }
    assert.equal(sentReasons.length, 2);
    assert.ok(sentReasons.every(reason => reason.includes(records['permissions/perm_student'].reason) && !reason.includes('Forged')));
    assert.ok(updates.every(value => Object.keys(value).every(key => key.startsWith('ai'))));
    assert.equal(records['permissions/perm_student'].status, 'Menunggu Pemeriksaan');
    assert.equal(records['permissions/perm_student'].aiStatus, 'completed');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
