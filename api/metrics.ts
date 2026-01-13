interface ModelMetric {
  tokens: number;
  cost: number;
}

const metrics = new Map<string, ModelMetric>();

export function recordUsage(model: string, tokens: number, cost: number) {
  const current = metrics.get(model) ?? { tokens: 0, cost: 0 };
  metrics.set(model, {
    tokens: current.tokens + tokens,
    cost: current.cost + cost,
  });
}

export function getUsage(model: string): ModelMetric {
  return metrics.get(model) ?? { tokens: 0, cost: 0 };
}
