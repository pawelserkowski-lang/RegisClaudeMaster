import { log } from '../logger';
import { setAuthCookies, signTokens, verifyRefreshToken } from '../auth-utils';
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

  const userId = await verifyRefreshToken(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Invalid refresh token' }), { status: 401, headers });
  }

  const tokens = await signTokens(userId);
  setAuthCookies(headers, tokens);
  log('info', 'Session refreshed', { userId });
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}
