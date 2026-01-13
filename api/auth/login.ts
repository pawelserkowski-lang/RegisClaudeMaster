import { log } from '../logger';
import { setAuthCookies, signTokens } from '../auth-utils';
import { buildCorsHeaders } from '../cors';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

export default async function handler(req: Request): Promise<Response> {
  const headers = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const { userId } = (await req.json()) as { userId?: string };
  const safeUserId = userId || 'demo-user';
  const tokens = await signTokens(safeUserId);
  setAuthCookies(headers, tokens);

  log('info', 'User logged in', { userId: safeUserId });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
