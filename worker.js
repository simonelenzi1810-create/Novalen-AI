/*
 * Novalen AI - Cloudflare Worker backend
 * Configure the GROQ_API_KEY secret in Cloudflare; never commit your key here.
 * Expected frontend endpoint: https://<worker-host>/api/chat
 */

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestBuckets = new Map();

const MODE_PROMPTS = {
  pulse: "Sei Novalen Pulse, un assistente rapido, chiaro e concreto. Rispondi in italiano salvo diversa richiesta. Dai risposte concise ma utili.",
  nexus: "Sei Novalen Nexus, un assistente per studio e ragionamento. Spiega i passaggi con ordine, usa esempi semplici quando aiutano e segnala l'incertezza. Rispondi in italiano salvo diversa richiesta.",
  apex: "Sei Novalen Apex, un assistente creativo e di produttività. Aiuta a generare, migliorare e organizzare idee in modo originale ma concreto. Rispondi in italiano salvo diversa richiesta."
};

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || "https://simonelenzi1810-create.github.io")
    .split(",").map(function (x) { return x.trim(); }).filter(Boolean);
}

function corsHeaders(origin, env) {
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  if (origin && allowedOrigins(env).includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }, headers || {})
  });
}

function limited(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const bucket = requestBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start >= WINDOW_MS) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  requestBuckets.set(ip, bucket);
  if (requestBuckets.size > 4000) {
    for (const entry of requestBuckets.entries()) {
      if (now - entry[1].start >= WINDOW_MS) requestBuckets.delete(entry[0]);
    }
  }
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = allowedOrigins(env);
    const headers = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      if (origin && !allowed.includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: headers });
    }

    if (origin && !allowed.includes(origin)) return json({ error: "Origine non autorizzata." }, 403);
    if (url.pathname === "/") {
      return json({ service: "Novalen AI API", status: "online", endpoint: "/api/chat" }, 200, headers);
    }
    if (url.pathname !== "/api/chat") return json({ error: "Percorso non trovato." }, 404, headers);
    if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405, headers);
    if (limited(request)) return json({ error: "Hai raggiunto il limite temporaneo. Attendi un minuto e riprova." }, 429, headers);
    if (!env.GROQ_API_KEY) return json({ error: "Backend non configurato: manca il secret GROQ_API_KEY in Cloudflare." }, 503, headers);

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "La richiesta deve essere JSON." }, 415, headers);
    }
    const length = Number(request.headers.get("Content-Length") || "0");
    if (length > 22_000) return json({ error: "Messaggio troppo lungo." }, 413, headers);

    let payload;
    try { payload = await request.json(); }
    catch (error) { return json({ error: "JSON della richiesta non valido." }, 400, headers); }

    const mode = MODE_PROMPTS[payload.mode] ? payload.mode : "pulse";
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return json({ error: "Invia almeno un messaggio." }, 400, headers);
    }

    const messages = [];
    for (const item of payload.messages.slice(-12)) {
      if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") continue;
      const content = item.content.trim();
      if (!content || content.length > 6000) continue;
      messages.push({ role: item.role, content: content });
    }
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "L'ultimo messaggio deve essere una domanda dell'utente." }, 400, headers);
    }

    let upstream;
    try {
      upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.GROQ_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.GROQ_MODEL || DEFAULT_MODEL,
          messages: [{ role: "system", content: MODE_PROMPTS[mode] }].concat(messages),
          max_completion_tokens: 900
        })
      });
    } catch (error) {
      return json({ error: "Non riesco a raggiungere il provider AI. Riprova più tardi." }, 502, headers);
    }

    if (!upstream.ok) {
      // Do not send provider payloads, request headers, or secrets back to the browser.
      if (upstream.status === 401 || upstream.status === 403) {
        return json({ error: "Il provider AI ha rifiutato la chiave. Controlla il secret GROQ_API_KEY in Cloudflare." }, 502, headers);
      }
      if (upstream.status === 429) return json({ error: "Il provider AI ha raggiunto il limite di utilizzo. Attendi e riprova." }, 429, headers);
      return json({ error: "Il provider AI ha restituito un errore. Controlla che il modello configurato sia disponibile." }, 502, headers);
    }

    let result;
    try { result = await upstream.json(); }
    catch (error) { return json({ error: "Risposta non valida dal provider AI." }, 502, headers); }

    const answer = result && result.choices && result.choices[0] &&
      result.choices[0].message && result.choices[0].message.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return json({ error: "Il provider non ha restituito testo. Prova con un altro messaggio." }, 502, headers);
    }
    return json({ reply: answer.trim(), model: env.GROQ_MODEL || DEFAULT_MODEL }, 200, headers);
  }
};
