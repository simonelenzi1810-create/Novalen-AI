import { z } from 'zod';
export const modes = {
  pulse: { label: 'Pulse', description: 'Chiarezza, ogni giorno' },
  nexus: { label: 'Nexus', description: 'Studia e comprendi' },
  apex: { label: 'Apex', description: 'Scrivi e immagina' },
} as const;
export type Mode = keyof typeof modes;
export const MAX_CONTEXT_CHARS = 24000;
export const MAX_MESSAGE_CHARS = 12000;
export const MAX_BODY_BYTES = 100000;
export const wireMessageSchema = z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) }).strict();
export const chatRequestSchema = z.object({
  model: z.string().min(1).max(120).optional(),
  mode: z.enum(['pulse', 'nexus', 'apex']).default('pulse'),
  instructions: z.string().max(1500).default(''), stream: z.boolean().default(true),
  messages: z.array(wireMessageSchema).min(1).max(40),
}).strict().superRefine((value, ctx) => {
  if (value.messages.at(-1)?.role !== 'user' || value.messages[0]?.role !== 'user')
    ctx.addIssue({ code: 'custom', message: 'La conversazione deve iniziare e terminare con un messaggio utente.' });
  if (value.messages.some((m, i) => i > 0 && m.role === value.messages[i - 1].role))
    ctx.addIssue({ code: 'custom', message: 'I ruoli della conversazione devono alternarsi.' });
  if (value.messages.reduce((sum, m) => sum + m.content.length, 0) > MAX_CONTEXT_CHARS)
    ctx.addIssue({ code: 'custom', message: 'Il contesto è troppo lungo.' });
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type WireMessage = z.infer<typeof wireMessageSchema>;
export type ModelInfo = { id: string; name: string; provider: string; description: string; configured: boolean };
export type Status = {
  models: ModelInfo[]; ready: boolean; requiresAccessCode: boolean;
  reason: 'missing_key' | 'security_setup' | null;
  providers: { id: string; name: string; state: 'configured' | 'not_configured' | 'planned' }[];
};
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; model: string; finishReason: string }
  | { type: 'error'; message: string; code: string };
