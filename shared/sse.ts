// Incremental parsing handles CRLF and UTF-8 characters split across chunks.
export async function* readSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader(); const decoder = new TextDecoder();
  let pending = ''; let data: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (pending.length > 256000) throw new Error('SSE frame too large');
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, ''); pending = pending.slice(newline + 1);
        if (!line) { if (data.length) yield data.join('\n'); data = []; }
        else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
          if (data.join('').length > 256000) throw new Error('SSE frame too large');
        }
      }
      if (done) {
        if (pending.startsWith('data:')) data.push(pending.slice(5).replace(/^ /, '').replace(/\r$/, ''));
        if (data.length) yield data.join('\n'); break;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
