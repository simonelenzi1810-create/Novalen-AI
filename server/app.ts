import { chatRequestSchema, type Status, type StreamEvent } from '../shared/contracts.ts';
import { readSSE } from '../shared/sse.ts';
import { providers, providerFor } from './providers/index.ts';
import { ApiError, publicError } from './errors.ts';
import { authorize, headersFor, rateLimit, readBody, securityReady } from './security.ts';
import type { Env } from './types.ts';
export function getStatus(env: Env): Status {
  const models = providers.flatMap(provider => provider.models(env)); const hasKey = models.some(model => model.configured);
  return {
    models, ready: hasKey && securityReady(env), requiresAccessCode: Boolean(env.APP_ACCESS_TOKEN),
    reason: !hasKey ? 'missing_key' : !securityReady(env) ? 'security_setup' : null,
    providers: [ { id: 'groq', name: 'Groq', state: hasKey ? 'configured' : 'not_configured' },
      { id: 'gemini', name: 'Google Gemini', state: 'planned' }, { id: 'openai', name: 'OpenAI API', state: 'planned' } ],
  };
}
function streamResponse(upstream: Response, model: string, headers: Headers, abort: AbortController): Response {
  if (!upstream.body || !upstream.headers.get('Content-Type')?.includes('text/event-stream'))
    throw new ApiError(502, 'invalid_stream', 'Il provider non ha restituito un flusso valido.');
  const encoder = new TextEncoder(); const iterator = readSSE(upstream.body);
  let hasText = false; let finishReason = 'stop'; let length = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const emit = (event: StreamEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        while (true) {
          const frame = await iterator.next();
          if (frame.done) throw new ApiError(502, 'stream_interrupted', 'La connessione si è interrotta. La risposta potrebbe essere incompleta.');
          if (frame.value === '[DONE]') {
            if (!hasText) throw new ApiError(502, 'empty_response', 'Il modello non ha restituito testo. Riprova.');
            emit({ type: 'done', model, finishReason }); controller.close(); await iterator.return(undefined); return;
          }
          let event;
          try { event = JSON.parse(frame.value); } catch { throw new ApiError(502, 'invalid_stream', 'Il provider ha restituito dati non validi.'); }
          if (event.error) throw new ApiError(502, 'provider_error', 'La generazione è stata interrotta dal provider.');
          const choice = event.choices?.[0];
          if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason;
          const content = choice?.delta?.content;
          if (typeof content === 'string' && content) {
            length += content.length;
            if (length > 100000) throw new ApiError(502, 'output_limit', 'La risposta ha superato il limite di lunghezza.');
            hasText = true; emit({ type: 'delta', text: content }); return;
          }
        }
      } catch (error) {
        const safe = publicError(error); emit({ type: 'error', message: safe.message, code: safe.code });
        controller.close(); abort.abort(); await iterator.return(undefined).catch(() => {});
      }
    },
    async cancel() { abort.abort(); await iterator.return(undefined).catch(() => {}); },
  });
  headers.set('Content-Type', 'text/event-stream; charset=utf-8'); headers.set('X-Accel-Buffering', 'no');
  return new Response(body, { headers });
}
export async function handleApi(request: Request, env: Env, transport: typeof fetch = fetch): Promise<Response> {
  let headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  try {
    headers = headersFor(request, env); const path = new URL(request.url).pathname;
    if (!['/api/status', '/api/chat'].includes(path)) throw new ApiError(404, 'not_found', 'Percorso non trovato.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (path === '/api/status') {
      if (request.method !== 'GET') throw new ApiError(405, 'method', 'Metodo non consentito.');
      return json(getStatus(env));
    }
    if (request.method !== 'POST') throw new ApiError(405, 'method', 'Metodo non consentito.');
    await rateLimit(request, env); await authorize(request, env);
    const parsed = chatRequestSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new ApiError(400, 'validation', 'Messaggi non validi o troppo lunghi. Riduci il testo e riprova.');
    const input = parsed.data; input.model ||= providers[0].models(env)[0]?.id;
    const provider = providerFor(input.model || '', env);
    if (!provider) throw new ApiError(400, 'model', 'Questo modello non è disponibile sul server.');
    if (!provider.models(env).find(m => m.id === input.model)?.configured)
      throw new ApiError(503, 'not_configured', 'AI non configurata: il gestore deve collegare Groq sul server.');
    if (!securityReady(env)) throw new ApiError(503, 'security_setup', 'Il server richiede la configurazione dei controlli di accesso.');
    const abort = new AbortController(); const signal = AbortSignal.any([request.signal, abort.signal, AbortSignal.timeout(60000)]);
    const response = await provider.complete(input, env, signal, transport);
    if (input.stream) return streamResponse(response, input.model!, headers, abort);
    let result;
    try { result = await response.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] }; }
    catch { throw new ApiError(502, 'invalid_response', 'Risposta non valida dal provider.'); }
    const text = result.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim() || text.length > 100000)
      throw new ApiError(502, 'empty_response', 'Il modello non ha restituito testo valido.');
    return json({ reply: text, model: input.model, finishReason: result.choices?.[0]?.finish_reason });
  } catch (error) {
    const safe = publicError(error); if (safe.status === 429) headers.set('Retry-After', '60');
    return json({ error: { code: safe.code, message: safe.message } }, safe.status);
  }
}
