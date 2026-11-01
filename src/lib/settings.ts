import { normalizeBackend } from './api';
export interface Settings { theme: 'dark' | 'light'; backend: string; instructions: string; saveHistory: boolean }
export const defaultSettings: Settings = { theme: 'dark', backend: '', instructions: '', saveHistory: true };
export function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem('novalen.settings.v1') || '{}');
    const legacy = localStorage.getItem('novalen_backend_url_v1');
    return { theme: value.theme === 'light' ? 'light' : 'dark', backend: normalizeBackend(value.backend || legacy || ''), instructions: typeof value.instructions === 'string' ? value.instructions.slice(0, 1500) : '', saveHistory: value.saveHistory !== false };
  } catch { return defaultSettings; }
}
