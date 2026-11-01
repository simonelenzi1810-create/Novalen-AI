import { handleApi } from './app.ts';
import type { Env } from './types.ts';
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    if (!env.ASSETS) return new Response('NOVALEN API. Frontend non configurato.', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
