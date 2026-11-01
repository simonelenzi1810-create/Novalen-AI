import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../src/components/Markdown';
import { streamChat } from '../src/lib/api';
import type { ChatRequest, StreamEvent } from '../shared/contracts';

test('Markdown does not execute HTML, javascript links or remote tracking images', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { content: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[link](javascript:alert%281%29)\n\n![image](https://tracker.invalid/pixel)' }));
  assert.ok(!html.includes('<script')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('onerror=')); assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('Immagine esterna'));
});
test('Markdown code stays literal, tables and code-copy controls are rendered', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { content: '```html\n<script>test()</script>\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |' }));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('<table>')); assert.ok(html.includes('Copia'));
});
test('frontend processes actual SSE protocol and detects incomplete responses', async () => {
  const original = globalThis.fetch;
  const body: ChatRequest = { model: 'groq:openai/gpt-oss-20b', mode: 'pulse', instructions: '', stream: true, messages: [{ role: 'user', content: 'test fixture' }] };
  try {
    globalThis.fetch = async () => new Response('data: {"type":"delta","text":"Caffè ☕"}\n\ndata: {"type":"done","model":"groq:test","finishReason":"stop"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    const events: StreamEvent[] = [];
    await streamChat('', '', body, new AbortController().signal, event => events.push(event));
    assert.equal(events.length, 2); assert.deepEqual(events[0], { type: 'delta', text: 'Caffè ☕' });
    globalThis.fetch = async () => new Response('data: {"type":"delta","text":"partial"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    await assert.rejects(() => streamChat('', '', body, new AbortController().signal, () => {}), /incompleta/);
    globalThis.fetch = async () => Response.json({ error: { message: 'AI non configurata' } }, { status: 503 });
    await assert.rejects(() => streamChat('', '', body, new AbortController().signal, () => {}), /non configurata/);
  } finally { globalThis.fetch = original; }
});
