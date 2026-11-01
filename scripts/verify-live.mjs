// Optional real integration test. Run only with a configured, authorized free account.
// Never prints credentials, upstream bodies, conversation content, or access codes.
const origin = new URL(process.env.NOVALEN_URL || 'http://localhost:5173').origin;
try {
  const statusResponse = await fetch(`${origin}/api/status`, { signal: AbortSignal.timeout(10000) });
  const status = await statusResponse.json();
  if (!statusResponse.ok || !status.ready) throw new Error('Backend non configurato. Completa i secret e i controlli di accesso.');
  const model = status.models.find(item => item.configured)?.id;
  const response = await fetch(`${origin}/api/chat`, {
    method: 'POST', signal: AbortSignal.timeout(65000),
    headers: { 'Content-Type': 'application/json', ...(process.env.APP_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.APP_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify({ model, mode: 'pulse', stream: false, messages: [{ role: 'user', content: 'Rispondi soltanto con la parola OK.' }] }),
  });
  if (!response.ok) throw new Error(`Test non riuscito, HTTP ${response.status}. Controlla la configurazione sul server.`);
  const result = await response.json();
  if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('Risposta AI vuota.');
  console.log('PASS: risposta testuale ricevuta dal provider reale tramite il backend.');
  console.log(`Modello: ${result.model}. Nessun contenuto o segreto stampato.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Test non riuscito.'); process.exitCode = 1;
}
