import { listAvailableModels } from './providers';
import { getUsage } from './metrics';
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
  const providers = listAvailableModels().map((model) => {
    const usage = getUsage(model.id);
    return {
      model: model.id,
      status: model.isConfigured() ? 'ok' : 'down',
      tokens: usage.tokens,
      cost: usage.cost,
    };
  });

  headers.set('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      providers,
    }),
    { status: 200, headers }
  );
}
