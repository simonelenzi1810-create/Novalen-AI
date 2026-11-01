import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import { handleApi } from './server/app.ts';
import type { Env } from './server/types.ts';

// Development only. Production runs the very same API handler in a Worker.
function localApi(env: Env): Plugin {
  return {
    name: 'novalen-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const abort = new AbortController();
        res.on('close', () => abort.abort());
        const origin = `http://${req.headers.host || 'localhost:5173'}`;
        const init: RequestInit & { duplex?: 'half' } = {
          method: req.method, headers: req.headers as HeadersInit, signal: abort.signal,
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
          init.duplex = 'half';
        }
        try {
          const response = await handleApi(new Request(new URL(req.url, origin), init), env);
          res.writeHead(response.status, Object.fromEntries(response.headers));
          if (response.body) Readable.fromWeb(response.body as never).pipe(res);
          else res.end();
        } catch {
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Errore del server locale.' } }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const values = loadEnv(mode, process.cwd(), '');
  const env = { ...values, ...process.env, APP_ENV: 'development' } as Env;
  return {
    base: './',
    plugins: [react(), localApi(env)],
    server: { host: '0.0.0.0', allowedHosts: ['terminal.local'] },
    build: { target: 'es2022', sourcemap: false },
  };
});
