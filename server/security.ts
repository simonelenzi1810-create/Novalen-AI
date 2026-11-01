import { MAX_BODY_BYTES } from '../shared/contracts.ts';
import { ApiError } from './errors.ts';
import type { Env } from './types.ts';
export function securityReady(env: Env): boolean {
  if (env.APP_ENV === 'development') return true;
  return Boolean(env.CHAT_RATE_LIMITER && env.SITE_RATE_LIMITER &&
    ((env.APP_ACCESS_TOKEN?.length || 0) >= 24 || env.ALLOW_PUBLIC_CHAT === 'true'));
}
export function headersFor(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Vary': 'Origin',
  });
  const origin = request.headers.get('Origin');
  const allowed = [new URL(request.url).origin, ...(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim())];
  if (origin && !allowed.includes(origin)) throw new ApiError(403, 'origin', 'Origine non autorizzata.');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' && !origin)
    throw new ApiError(403, 'origin', 'Origine non autorizzata.');
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '600'); headers.set('Access-Control-Expose-Headers', 'Retry-After');
  return headers;
}
export async function authorize(request: Request, env: Env) {
  if (!env.APP_ACCESS_TOKEN) return;
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const encoder = new TextEncoder();
  const hashes = await Promise.all([token, env.APP_ACCESS_TOKEN].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const a = new Uint8Array(hashes[0]); const b = new Uint8Array(hashes[1]); let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference) throw new ApiError(401, 'access_code', 'Inserisci il codice di accesso nelle impostazioni.');
}
const buckets = new Map<string, { count: number; until: number }>();
function localLimit(key: string, limit: number, now = Date.now()): boolean {
  for (const [k, value] of buckets) if (value.until <= now) buckets.delete(k);
  if (buckets.size > 5000) return false;
  const bucket = buckets.get(key) || { count: 0, until: now + 60000 };
  bucket.count++; buckets.set(key, bucket); return bucket.count <= limit;
}
export async function rateLimit(request: Request, env: Env) {
  // Cloudflare supplies CF-Connecting-IP. Never trust X-Forwarded-For.
  const ip = env.APP_ENV === 'development' ? 'local' : request.headers.get('CF-Connecting-IP') || 'unknown';
  const perClient = env.CHAT_RATE_LIMITER ? (await env.CHAT_RATE_LIMITER.limit({ key: ip })).success : localLimit(ip, 10);
  const global = env.SITE_RATE_LIMITER ? (await env.SITE_RATE_LIMITER.limit({ key: 'novalen' })).success : localLimit('global', 25);
  if (!perClient || !global) throw new ApiError(429, 'rate_limit', 'Troppe richieste. Attendi un minuto prima di riprovare.');
}
export async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new ApiError(415, 'content_type', 'La richiesta deve essere JSON.');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES)
    throw new ApiError(413, 'body_limit', 'La richiesta è troppo grande.');
  if (!request.body) throw new ApiError(400, 'invalid_json', 'La richiesta è vuota.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, 'body_limit', 'La richiesta è troppo grande.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, 'invalid_json', 'JSON non valido.'); }
}
