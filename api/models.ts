import { listAvailableModels } from './providers';
import { buildCorsHeaders } from './cors';

export const config = {
  runtime: 'edge',
  regions: ['cdg1', 'fra1'],
};

export default function handler(req: Request): Response {
  const headers = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const models = listAvailableModels()
    .filter((model) => model.isConfigured())
    .map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
    }));

  headers.set('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return new Response(JSON.stringify({ models }), { status: 200, headers });
}
