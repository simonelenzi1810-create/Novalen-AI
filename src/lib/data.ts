import { z } from 'zod';
import { MAX_CONTEXT_CHARS, MAX_MESSAGE_CHARS, type Mode, type WireMessage } from '../../shared/contracts';
const attachmentSchema = z.object({ id: z.string().max(100), name: z.string().max(200), content: z.string().max(8000), size: z.number().min(0).max(32000) });
export type Attachment = z.infer<typeof attachmentSchema>;
const messageSchema = z.object({
  id: z.string().max(100), role: z.enum(['user', 'assistant']), content: z.string().max(100000),
  status: z.enum(['complete', 'streaming', 'error', 'stopped']).default('complete'),
  error: z.string().max(1000).optional(), model: z.string().max(150).optional(),
  attachments: z.array(attachmentSchema).max(3).optional(),
});
export type Message = z.infer<typeof messageSchema>;
const conversationSchema = z.object({
  id: z.string().max(100), title: z.string().max(100),
  createdAt: z.number().finite(), updatedAt: z.number().finite(),
  mode: z.enum(['pulse', 'nexus', 'apex']), model: z.string().max(150),
  messages: z.array(messageSchema).max(1000),
});
export type Conversation = z.infer<typeof conversationSchema>;
const archiveSchema = z.object({ version: z.literal(1), conversations: z.array(conversationSchema).max(100) });
export interface ConversationRepository { load(): Conversation[]; save(chats: Conversation[]): void }
export const STORAGE_KEY = 'novalen.conversations.v1';
export const localRepository: ConversationRepository = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseArchive(raw).map(c => ({ ...c, messages: c.messages.map(m => m.status === 'streaming' ? { ...m, status: 'stopped', error: 'Generazione interrotta dalla chiusura della pagina.' } : m) })) : [];
  },
  save(chats) {
    const raw = JSON.stringify({ version: 1, conversations: chats });
    if (raw.length > 4000000) throw new Error('Archivio pieno. Esporta le chat e rimuovi quelle che non ti servono.');
    try { localStorage.setItem(STORAGE_KEY, raw); }
    catch { throw new Error('Impossibile salvare nel browser. Esporta le chat per conservarle.'); }
  },
};
export function parseArchive(raw: string): Conversation[] {
  if (raw.length > 4000000) throw new Error('Archivio troppo grande (massimo 4 MB).');
  const result = archiveSchema.safeParse(JSON.parse(raw));
  if (!result.success) throw new Error('Formato archivio non valido. Usa un’esportazione JSON di NOVALEN AI.');
  const chats = result.data.conversations;
  if (new Set(chats.map(c => c.id)).size !== chats.length || chats.some(c => new Set(c.messages.map(m => m.id)).size !== c.messages.length))
    throw new Error('Archivio non valido: identificativi duplicati.');
  return chats;
}
export function uid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues also works in HTTP local previews; identifiers are not credentials.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function newConversation(mode: Mode, model: string): Conversation {
  return { id: uid(), title: 'Nuova conversazione', createdAt: Date.now(), updatedAt: Date.now(), mode, model, messages: [] };
}
export function messageContent(message: Message): string {
  return [message.content, ...(message.attachments || []).map(a => `\n<documento nome=${JSON.stringify(a.name)}>\n${a.content}\n</documento>`)].join('\n');
}
export function buildContext(messages: Message[]): { messages: WireMessage[]; omitted: boolean } {
  const result: WireMessage[] = []; let size = 0; let start = messages.length;
  // Keep complete user/assistant pairs, ending with the current user message.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && (!m.content || m.status === 'error')) continue;
    const content = messageContent(m).trim();
    if (i === messages.length - 1 && content.length > MAX_MESSAGE_CHARS) throw new Error('Messaggio e allegati superano 12.000 caratteri. Riducili e riprova.');
    if (content.length > MAX_MESSAGE_CHARS || size + content.length > MAX_CONTEXT_CHARS || result.length >= 39) break;
    if (!content) continue;
    result.unshift({ role: m.role, content }); size += content.length; start = i;
  }
  while (result[0]?.role === 'assistant') { result.shift(); start++; }
  // A failed earlier answer may leave consecutive user turns. Only the latest is relevant.
  for (let i = result.length - 2; i >= 0; i--) if (result[i].role === result[i + 1].role) { result.splice(0, i + 1); start = Math.max(start, 1); break; }
  return { messages: result, omitted: start > 0 };
}
export function markdownExport(chat: Conversation): string {
  return `# ${chat.title}\n\nEsportato da NOVALEN AI · ${new Date().toLocaleDateString('it-IT')}\n\n` +
    chat.messages.map(m => `## ${m.role === 'user' ? 'Tu' : 'NOVALEN AI'}\n\n${messageContent(m)}${m.error ? `\n\n*${m.error}*` : ''}\n`).join('\n---\n\n');
}
export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function readAttachment(file: File): Promise<Attachment> {
  if (!/\.(txt|md|csv|json|js|ts|tsx|jsx|py|html|css|sql|yml|yaml)$/i.test(file.name))
    throw new Error('Allega un file di testo, Markdown, CSV, JSON o codice. PDF e immagini non sono ancora supportati.');
  if (file.size > 32000) throw new Error('Ogni file deve essere più piccolo di 32 KB.');
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('Il file deve contenere testo UTF-8.'); }
  if (content.includes('\0') || !content.trim()) throw new Error('File vuoto o non testuale.');
  if (content.length > 8000) throw new Error('Ogni allegato può contenere al massimo 8.000 caratteri.');
  return { id: uid(), name: file.name.slice(0, 200), content, size: file.size };
}
