export interface RateLimiter { limit(input: { key: string }): Promise<{ success: boolean }> }
export interface Env {
  GROQ_API_KEY?: string; GROQ_MODELS?: string; GROQ_MODEL?: string;
  APP_ENV?: string; APP_ACCESS_TOKEN?: string; ALLOW_PUBLIC_CHAT?: string; ALLOWED_ORIGIN?: string;
  CHAT_RATE_LIMITER?: RateLimiter; SITE_RATE_LIMITER?: RateLimiter;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
