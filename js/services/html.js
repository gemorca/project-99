export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function jsArg(value) {
  return escapeHtml(JSON.stringify(String(value === null || value === undefined ? '' : value)));
}

export function safeUrl(value) {
  const s = String(value === null || value === undefined ? '' : value).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
