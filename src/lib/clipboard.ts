export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* HTTP/permission fallback */ }
  }
  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
  document.body.appendChild(field); field.select();
  const copied = document.execCommand('copy'); field.remove(); previous?.focus();
  if (!copied) throw new Error('Clipboard unavailable');
}
