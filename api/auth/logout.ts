import { log } from '../logger';
import { clearAuthCookies } from '../auth-utils';
import { buildCorsHeaders } from '../cors';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

export default function handler(req: Request): Response {
  const headers = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  clearAuthCookies(headers);
  log('info', 'User logged out');
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
