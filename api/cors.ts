export function buildCorsHeaders(origin: string | null): Headers {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] ?? '';
  const headers = new Headers();
  if (allowOrigin) {
    headers.set('Access-Control-Allow-Origin', allowOrigin);
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  headers.set('Access-Control-Allow-Credentials', 'true');
  return headers;
}
