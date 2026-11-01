export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function publicError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    return new ApiError(504, 'timeout', 'La risposta ha richiesto troppo tempo. Riprova.');
  return new ApiError(502, 'provider_error', 'Il servizio AI non è raggiungibile. Riprova tra poco.');
}
