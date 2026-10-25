// Offline test for netlify/functions/submission-created.js (property-inquiry -> ntfy).
//   node .claude/tests/lead-function.test.cjs
// fetch is stubbed: nothing leaves the machine.
'use strict';
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const { mintHumanToken } = require(path.join(ROOT, 'netlify/functions/_lib/lead-guard.js'));
const { handler } = require(path.join(ROOT, 'netlify/functions/submission-created.js'));

let calls = [];
global.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; };
process.env.NTFY_TOPIC = 'test-topic-offline';

const base = {
  name: 'Pat Olson', email: 'pat.lead@gmail.com', phone: '(320) 555-2671', interest: 'equestrian-estate',
  message: 'We would like to walk the property next Saturday. Is the barn heated? We have 6 horses.',
  'bot-field': '', ip: '1.2.3.4', user_agent: 'x', referrer: 'https://circle-r-estate-sale.netlify.app/',
};
const ev = (data) => ({ body: JSON.stringify({ payload: { form_name: 'property-inquiry', data } }) });
const withToken = (d) => ({ ...d, human: mintHumanToken(d.email, d.phone) });

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('verified English inquiry pushes once, JSON publish, title/tags/priority/body', async () => {
  calls = [];
  const r = await handler(ev(withToken(base)));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://ntfy.sh');
  const b = JSON.parse(calls[0].init.body);
  assert.strictEqual(b.topic, 'test-topic-offline');
  assert.strictEqual(b.title, 'Circle R Estate — new lead');
  assert.strictEqual(b.priority, 4);
  assert.deepStrictEqual(b.tags, ['house', 'telephone_receiver']);
  assert.strictEqual(b.click, 'tel:3205552671');
  for (const s of ['Name: Pat Olson', 'Phone: (320) 555-2671', 'Email: pat.lead@gmail.com', 'Private equestrian estate', 'Is the barn heated?']) {
    assert.ok(b.message.includes(s), s);
  }
});

test('long message is trimmed to ~400 chars', async () => {
  calls = [];
  await handler(ev(withToken({ ...base, message: 'We are very interested in the land. '.repeat(40) })));
  const b = JSON.parse(calls[0].init.body);
  assert.ok(b.message.length < 400 + 200, String(b.message.length));
  assert.ok(b.message.endsWith('…'));
});

test('no human token (a bot or JS off) -> quiet, no push', async () => {
  calls = [];
  const r = await handler(ev(base));
  assert.strictEqual(r.body, 'guard-quiet');
  assert.strictEqual(calls.length, 0);
});

test('honeypot filled -> drop, no push', async () => {
  calls = [];
  const r = await handler(ev(withToken({ ...base, 'bot-field': 'x' })));
  assert.strictEqual(r.body, 'guard-drop');
  assert.strictEqual(calls.length, 0);
});

test('non-English inquiry with a token -> quiet (Fair Housing), never dropped, no push', async () => {
  for (const message of ['Hola, quería saber el precio de la propiedad, por favor.', '你好，我想知道你的价格。',
    'Привет, я хотел узнать твой прайс.']) {
    calls = [];
    const r = await handler(ev(withToken({ ...base, message })));
    assert.strictEqual(r.body, 'guard-quiet', message);
    assert.strictEqual(calls.length, 0, message);
  }
});

test('price-template bot without a token -> drop, no push', async () => {
  calls = [];
  const r = await handler(ev({ ...base, name: 'Robertupsex', message: 'Hi, I wanted to know your price.' }));
  assert.strictEqual(r.body, 'guard-drop');
  assert.strictEqual(calls.length, 0);
});

test('missing NTFY_TOPIC -> no push attempt, non-2xx', async () => {
  calls = [];
  const t = process.env.NTFY_TOPIC;
  delete process.env.NTFY_TOPIC;
  const r = await handler(ev(withToken(base)));
  process.env.NTFY_TOPIC = t;
  assert.strictEqual(calls.length, 0);
  assert.notStrictEqual(r.statusCode, 200);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log('ok   ', name); } catch (e) { failed += 1; console.log('FAIL ', name, '\n     ', e.message); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
