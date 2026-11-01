import type { ChatRequest, Status, StreamEvent } from '../../shared/contracts';
import { readSSE } from '../../shared/sse';
export function normalizeBackend(input: string): string {
  if (!input.trim()) return '';
  const url = new URL(input.trim());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash)
    throw new Error('Usa un URL HTTPS senza password, parametri o chiavi API.');
  if (!['', '/', '/api', '/api/', '/api/chat'].includes(url.pathname)) throw new Error('Inserisci il dominio del Worker, eventualmente seguito da /api/chat.');
  return url.origin;
}
export async function fetchStatus(backend: string, signal?: AbortSignal): Promise<Status> {
  const response = await fetch(`${backend}/api/status`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Backend non raggiungibile. Verifica la connessione nelle impostazioni.');
  const data = await response.json();
  if (typeof data.ready !== 'boolean' || !Array.isArray(data.models) || !Array.isArray(data.providers)) throw new Error('Il backend deve essere aggiornato alla nuova versione.');
  return data;
}
export async function streamChat(backend: string, accessCode: string, body: ChatRequest, signal: AbortSignal, onEvent: (event: StreamEvent) => void) {
  const response = await fetch(`${backend}/api/chat`, {
    method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(70000)]), credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(accessCode ? { Authorization: `Bearer ${accessCode}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || `Richiesta non riuscita (${response.status}).`);
  }
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) throw new Error('Il backend non supporta questa versione della chat.');
  let done = false;
  for await (const frame of readSSE(response.body)) {
    const event = JSON.parse(frame) as StreamEvent;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'done') done = true;
    onEvent(event);
  }
  if (!done) throw new Error('Connessione interrotta. La risposta è incompleta.');
}
