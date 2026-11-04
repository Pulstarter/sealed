import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateMetaCase } from '../src/meta-generation.js';

const config = { role: 'technician' as const, tone: 'tension' as const, detail: 'Snow at the shutters' };
const draft = { title: 'The Winter Ledger', reserve: 'the emergency repair reserve',
  motive: 'to conceal losses from a failed private business', coverStory: 'payment for an urgent boiler replacement',
  recipient: 'Northgate Repairs', documentTitle: 'Emergency Boiler Invoice', cargoCode: 'C42', commandCode: 'R3' };
function reply(content: unknown, finish_reason = 'stop') {
  return Response.json({ model: 'muse-spark-1.3', choices: [{ finish_reason, message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 200, completion_tokens: 300, total_tokens: 500 } });
}

test('the Meta adapter sends structured generation and seals only a validated world', async () => {
  let payload: Record<string, any> = {};
  const result = await generateMetaCase(config, { apiKey: 'test-only-key', fetch: async (url, init) => {
    assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
    payload = JSON.parse(init!.body as string); assert.equal(new Headers(init!.headers).get('Authorization'), 'Bearer test-only-key');
    return reply(draft);
  } });
  assert.equal(payload.model, 'muse-spark-1.3'); assert.equal(payload.response_format.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.equal(payload.messages[0].role, 'developer'); assert.equal(payload.messages[1].role, 'user');
  assert.ok(!JSON.stringify(payload).includes('test-only-key'));
  assert.equal(result.world.origin, 'meta'); assert.equal(result.validation.successRoutes, 4);
  assert.equal(result.attempts.length, 1); assert.equal(result.attempts[0]!.inputTokens, 200);
  assert.equal(createHash('sha256').update(result.canonical).digest('hex'), result.hash);
});

test('an invalid returned draft gets one bounded repair and accounts for both responses', async () => {
  let calls = 0;
  const result = await generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => reply(++calls === 1 ? { ...draft, cargoCode: 'INVALID' } : draft) });
  assert.equal(calls, 2); assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]!.accepted, false); assert.equal(result.attempts[1]!.accepted, true);
  assert.equal(result.attempts.reduce((sum, item) => sum + (item.inputTokens ?? 0), 0), 400);
});

test('invalid drafts never fall back to a prepared world or cause unlimited paid requests', async () => {
  let calls = 0;
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => { calls++; return reply({ ...draft, actions: [] }); } }), /validation/i);
  assert.equal(calls, 2);
});

test('HTTP failures are sanitized and not retried as if a response were free', async () => {
  let calls = 0;
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => {
    calls++; return new Response('test-only-key and private provider data', { status: 401 });
  } }), error => error instanceof Error && /401/.test(error.message) && !error.message.includes('test-only-key'));
  assert.equal(calls, 1);
});

test('missing credentials and invalid configuration are rejected before network access', async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return reply(draft); };
  await assert.rejects(generateMetaCase(config, { apiKey: '', fetch: fetcher }));
  await assert.rejects(generateMetaCase({ ...config, detail: 'x'.repeat(161) }, { apiKey: 'test-only-key', fetch: fetcher }));
  assert.equal(calls, 0);
});

test('a transport error produces no seal, exposes no provider error and does not retry', async () => {
  let calls = 0;
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => {
    calls++; throw new Error('private provider data test-only-key');
  } }), error => error instanceof Error && /transport/i.test(error.message) && !error.message.includes('test-only-key'));
  assert.equal(calls, 1);
});

test('truncated responses or an unexpected model are never accepted as a sealed case', async () => {
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => reply(draft, 'length') }));
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => Response.json({ model: 'other', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(draft) } }] }) }));
});

test('a persistence callback failure never triggers another paid request', async () => {
  let calls = 0, writes = 0;
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => { calls++; return reply(draft); },
    onAttempt: () => { writes++; throw new Error('Receipt write failed'); } }), /Receipt write failed/);
  assert.equal(calls, 1); assert.equal(writes, 1);
});

test('an unreadable response still records an attempted call with unknown usage', async () => {
  const attempts: unknown[] = [];
  await assert.rejects(generateMetaCase(config, { apiKey: 'test-only-key', fetch: async () => new Response('not json'),
    onAttempt: attempt => { attempts.push(attempt); } }), /unreadable/i);
  assert.equal(attempts.length, 1);
});
