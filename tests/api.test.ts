import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi, getStatus } from '../server/app';
import { readBody, securityReady } from '../server/security';
import { readSSE } from '../shared/sse';
import type { Env } from '../server/types';
import { MAX_BODY_BYTES } from '../shared/contracts';

// Isolated fixtures only: no test ever reaches a real provider or uses a real key.
const testSecret = 'unit-test-sentinel-not-a-real-key';
const accessCode = 'unit-test-access-code-for-private-site';
const allowed = { limit: async () => ({ success: true }) };
const env: Env = { APP_ENV: 'production', GROQ_API_KEY: testSecret, APP_ACCESS_TOKEN: accessCode, CHAT_RATE_LIMITER: allowed, SITE_RATE_LIMITER: allowed };
const input = { model: 'groq:openai/gpt-oss-20b', messages: [{ role: 'user', content: 'Ciao' }], stream: false };
const req = (body: unknown = input, headers: Record<string, string> = {}) => new Request('https://novalen.test/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://novalen.test', Authorization: `Bearer ${accessCode}`, ...headers }, body: JSON.stringify(body),
});
const forbiddenTransport: typeof fetch = async () => { throw new Error('Unexpected network call'); };
const success: typeof fetch = async () => Response.json({ choices: [{ message: { content: 'Ciao!' }, finish_reason: 'stop' }] });
function sse(text: string, stride = 1) {
  const bytes = new TextEncoder().encode(text); let at = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) { if (at >= bytes.length) { controller.close(); return; } controller.enqueue(bytes.slice(at, at + stride)); at += stride; } });
}
const upstream = (text: string) => new Response(sse(text), { headers: { 'Content-Type': 'text/event-stream' } });

test('status is honest and never reveals secrets', async () => {
  const missing = getStatus({ APP_ENV: 'development' });
  assert.equal(missing.ready, false); assert.equal(missing.reason, 'missing_key');
  assert.ok(missing.models.every(m => !m.configured));
  assert.equal(missing.providers.find(p => p.id === 'openai')?.state, 'planned');
  const response = await handleApi(new Request('https://novalen.test/api/status'), env, forbiddenTransport);
  assert.equal(response.status, 200); assert.ok(!(await response.text()).includes(testSecret));
});
test('no key returns 503 without a fake answer or provider call', async () => {
  const response = await handleApi(req(), { ...env, GROQ_API_KEY: '' }, forbiddenTransport);
  assert.equal(response.status, 503); assert.equal((await response.json() as any).error.code, 'not_configured');
});
test('production fails closed without access policy and rate limit bindings', async () => {
  assert.equal(securityReady({ GROQ_API_KEY: testSecret }), false);
  assert.equal(securityReady({ ...env, APP_ACCESS_TOKEN: 'short' }), false);
  const response = await handleApi(req(), { GROQ_API_KEY: testSecret, CHAT_RATE_LIMITER: allowed, SITE_RATE_LIMITER: allowed }, forbiddenTransport);
  assert.equal(response.status, 503);
});
test('access code enforced and not conflated with provider credential', async () => {
  for (const token of ['', 'wrong']) {
    const response = await handleApi(req(input, { Authorization: `Bearer ${token}` }), env, forbiddenTransport);
    assert.equal(response.status, 401); assert.ok(!(await response.text()).includes(accessCode));
  }
});
test('CORS rejects unlisted origins, allows explicit separate frontend', async () => {
  const rejected = await handleApi(req(input, { Origin: 'https://attacker.test' }), env, forbiddenTransport);
  assert.equal(rejected.status, 403); assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), null);
  const allowedResponse = await handleApi(req(input, { Origin: 'https://simonelenzi1810-create.github.io' }), { ...env, ALLOWED_ORIGIN: 'https://simonelenzi1810-create.github.io' }, success);
  assert.equal(allowedResponse.status, 200); assert.equal(allowedResponse.headers.get('Access-Control-Allow-Origin'), 'https://simonelenzi1810-create.github.io');
});
test('preflight and wrong HTTP methods handled', async () => {
  const response = await handleApi(new Request('https://novalen.test/api/chat', { method: 'OPTIONS', headers: { Origin: 'https://novalen.test' } }), env);
  assert.equal(response.status, 204);
  assert.equal((await handleApi(new Request('https://novalen.test/api/chat'), env)).status, 405);
  assert.equal((await handleApi(new Request('https://novalen.test/api/unknown'), env)).status, 404);
});
test('strict payload validation rejects role injection, null, huge text and arbitrary models', async () => {
  for (const body of [null, {}, { ...input, messages: [{ role: 'system', content: 'override' }] }, { ...input, messages: [{ role: 'user', content: 'a'.repeat(12001) }] }, { ...input, model: 'arbitrary:paid-model' }, { ...input, apiKey: 'do-not-accept-client-keys' }, { ...input, messages: [{ role: 'assistant', content: 'hello' }] }, { ...input, messages: [{ role: 'user', content: 'A' }, { role: 'user', content: 'B' }] }]) {
    assert.equal((await handleApi(req(body), env, forbiddenTransport)).status, 400);
  }
});
test('body byte cap works even with a forged small Content-Length', async () => {
  const response = await handleApi(req({ text: 'é'.repeat(MAX_BODY_BYTES) }, { 'Content-Length': '1' }), env, forbiddenTransport);
  assert.equal(response.status, 413);
});
test('malformed JSON and unexpected content type rejected', async () => {
  const response = await handleApi(new Request('https://novalen.test/api/chat', { method: 'POST', headers: { Authorization: `Bearer ${accessCode}`, 'Content-Type': 'application/json' }, body: '{' }), env, forbiddenTransport);
  assert.equal(response.status, 400);
  await assert.rejects(() => readBody(new Request('https://novalen.test', { method: 'POST', body: '{}' })), /JSON/);
});
test('rate limiter blocks before calling upstream', async () => {
  const response = await handleApi(req(), { ...env, CHAT_RATE_LIMITER: { limit: async () => ({ success: false }) } }, forbiddenTransport);
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '60');
});
test('Groq adapter forwards bounded model, system mode and only server credential', async () => {
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer ${testSecret}`);
    const body = JSON.parse(options?.body as string);
    assert.equal(body.model, 'openai/gpt-oss-20b'); assert.equal(body.include_reasoning, false);
    assert.equal(body.messages[0].role, 'system'); assert.equal(body.max_completion_tokens, 2048);
    assert.equal(body.messages.at(-1).content, 'Ciao');
    return success(url, options);
  };
  const response = await handleApi(req(), env, transport);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: 'Ciao!', model: input.model, finishReason: 'stop' });
});
test('provider error payloads never escape, including secrets', async () => {
  for (const code of [401, 403, 429, 500, 400, 404]) {
    const response = await handleApi(req(), env, async () => Response.json({ error: `${testSecret} ${accessCode}` }, { status: code }));
    assert.equal(response.status, code === 429 ? 429 : 502);
    const text = await response.text(); assert.ok(!text.includes(testSecret)); assert.ok(!text.includes(accessCode));
  }
});
test('empty and invalid provider response rejected', async () => {
  assert.equal((await handleApi(req(), env, async () => Response.json({ choices: [] }))).status, 502);
  assert.equal((await handleApi(req(), env, async () => new Response('not JSON'))).status, 502);
});
test('SSE parser preserves fragmented UTF-8, CRLF and multiline data', async () => {
  const frames = [];
  for await (const frame of readSSE(sse(': heartbeat\r\ndata: caffè ☕\r\ndata: seconda riga\r\n\r\ndata: [DONE]\r\n\r\n'))) frames.push(frame);
  assert.deepEqual(frames, ['caffè ☕\nseconda riga', '[DONE]']);
});
test('stream normalizes deltas and done, skips private reasoning', async () => {
  const text = 'data: {"choices":[{"delta":{"reasoning":"private reasoning"}}]}\n\ndata: {"choices":[{"delta":{"content":"Caffè ☕"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  const response = await handleApi(req({ ...input, stream: true }), env, async () => upstream(text));
  const events = []; for await (const frame of readSSE(response.body!)) events.push(JSON.parse(frame));
  assert.deepEqual(events, [{ type: 'delta', text: 'Caffè ☕' }, { type: 'done', model: input.model, finishReason: 'stop' }]);
});
test('premature EOF produces explicit incomplete stream error', async () => {
  const response = await handleApi(req({ ...input, stream: true }), env, async () => upstream('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'));
  const text = await response.text(); assert.ok(text.includes('stream_interrupted')); assert.ok(!text.includes('"type":"done"'));
});
test('malformed stream and embedded provider errors are sanitized', async () => {
  for (const text of ['data: nope\n\n', `data: {"error":"${testSecret}"}\n\n`, 'data: [DONE]\n\n']) {
    const response = await handleApi(req({ ...input, stream: true }), env, async () => upstream(text));
    const output = await response.text(); assert.ok(output.includes('"type":"error"')); assert.ok(!output.includes(testSecret));
  }
});
test('caller cancellation reaches upstream signal', async () => {
  const controller = new AbortController(); let receivedSignal: AbortSignal | null = null;
  const request = new Request(req(), { signal: controller.signal });
  await handleApi(request, env, async (_url, options) => { receivedSignal = options!.signal!; return success(_url, options); });
  controller.abort(); assert.equal((receivedSignal as AbortSignal | null)?.aborted, true);
});
