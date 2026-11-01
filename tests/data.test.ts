import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext, newConversation, parseArchive, markdownExport, readAttachment, type Message } from '../src/lib/data';
import { normalizeBackend } from '../src/lib/api';
import { chatRequestSchema } from '../shared/contracts';
const msg = (role: 'user' | 'assistant', content: string): Message => ({ id: crypto.randomUUID(), role, content, status: 'complete' });
test('conversation export and import preserve data and attachments', () => {
  const chat = newConversation('nexus', 'groq:openai/gpt-oss-20b'); chat.title = 'Appunti';
  chat.messages = [{ ...msg('user', 'Riassumi'), attachments: [{ id: 'file1', name: 'note.txt', content: 'Un contenuto', size: 12 }] }, msg('assistant', 'Risposta')];
  assert.deepEqual(parseArchive(JSON.stringify({ version: 1, conversations: [chat] })), [chat]);
  assert.match(markdownExport(chat), /note.txt/); assert.match(markdownExport(chat), /Un contenuto/);
});
test('untrusted imports reject wrong schema, excessive data and duplicate IDs', () => {
  assert.throws(() => parseArchive('{"version":99,"conversations":[]}'));
  assert.throws(() => parseArchive('x'.repeat(4000001)));
  const chat = newConversation('pulse', 'test');
  assert.throws(() => parseArchive(JSON.stringify({ version: 1, conversations: [chat, chat] })));
});
test('context trimming respects complete turns and leaves stored history intact', () => {
  const history = [msg('user', 'a'.repeat(8000)), msg('assistant', 'b'.repeat(8000)), msg('user', 'c'.repeat(8000)), msg('assistant', 'd'.repeat(8000)), msg('user', 'Ultima domanda')];
  const result = buildContext(history);
  assert.equal(result.omitted, true); assert.equal(result.messages[0].role, 'user');
  assert.equal(result.messages.at(-1)?.content, 'Ultima domanda'); assert.equal(history.length, 5);
  assert.ok(chatRequestSchema.safeParse({ messages: result.messages }).success);
});
test('failed assistant turns do not poison the next request', () => {
  const history = [msg('user', 'old'), { ...msg('assistant', ''), status: 'error' as const }, msg('user', 'new')];
  assert.deepEqual(buildContext(history).messages, [{ role: 'user', content: 'new' }]);
});
test('oversized current message is rejected rather than silently truncated', () => {
  assert.throws(() => buildContext([msg('user', 'x'.repeat(12001))]), /12.000/);
});
test('backend URL excludes secrets, arbitrary paths and insecure remote URLs', () => {
  assert.equal(normalizeBackend('https://demo.workers.dev/api/chat'), 'https://demo.workers.dev');
  assert.equal(normalizeBackend('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeBackend(''), '');
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:secret@example.org', 'https://example.org?key=private', 'https://example.org/elsewhere', 'https://example.org/#token']) assert.throws(() => normalizeBackend(url));
});
test('text attachments are decoded, bounded and reject binary formats', async () => {
  assert.equal((await readAttachment(new File(['Caffè'], 'appunti.txt'))).content, 'Caffè');
  await assert.rejects(() => readAttachment(new File(['PDF'], 'documento.pdf')), /non sono ancora supportati/);
  await assert.rejects(() => readAttachment(new File(['a'.repeat(8001)], 'longo.txt')), /8.000/);
  await assert.rejects(() => readAttachment(new File(['a\0b'], 'binary.txt')), /non testuale/);
  await assert.rejects(() => readAttachment(new File([new Uint8Array([255, 254])], 'bad.txt')), /UTF-8/);
});
