import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Props for the CostDisplay component
 */
interface CostDisplayProps {
  /** Provider identifier */
  provider: string;
  /** Number of input tokens used */
  inputTokens: number;
  /** Number of output tokens used */
  outputTokens: number;
  /** Cost per 1000 tokens for this provider */
  costPer1kTokens: number;
  /** Optional CSS class name */
  className?: string;
  /** Show detailed breakdown or compact view */
  detailed?: boolean;
}

/**
 * Format a cost value for display
 */
function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.0001) return `$${cost.toFixed(6)}`;
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format a number with thousand separators
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * CostDisplay Component
 *
 * Displays the estimated cost for a request based on token usage.
 * Shows "Free (local)" for providers with zero cost (like Ollama).
 */
export function CostDisplay({
  provider: _provider,
  inputTokens,
  outputTokens,
  costPer1kTokens,
  className = '',
  detailed = false,
}: CostDisplayProps) {
  // Provider is used for identification but not displayed in this component
  void _provider;
  const { t } = useTranslation();

  const { totalTokens, cost } = useMemo(() => {
    const tokens = inputTokens + outputTokens;
    const calculatedCost = (tokens / 1000) * costPer1kTokens;
    return { totalTokens: tokens, cost: calculatedCost };
  }, [inputTokens, outputTokens, costPer1kTokens]);

  // Free local provider
  if (costPer1kTokens === 0) {
    return (
      <span className={`text-xs text-green-500/50 ${className}`}>
        {t('cost.free', 'Free (local)')}
        {detailed && totalTokens > 0 && (
          <span className="ml-1 text-green-500/30">
            ({formatNumber(totalTokens)} {t('cost.tokensLabel', 'tokens')})
          </span>
        )}
      </span>
    );
  }

  // Detailed view with breakdown
  if (detailed) {
    return (
      <div className={`text-xs ${className}`}>
        <div className="flex items-center gap-2 text-green-500/50">
          <span className="font-medium text-green-400">{formatCost(cost)}</span>
          <span>({formatNumber(totalTokens)} {t('cost.tokensLabel', 'tokens')})</span>
        </div>
        <div className="text-green-500/30 mt-0.5 flex gap-2">
          <span>
            {t('cost.input', 'In')}: {formatNumber(inputTokens)}
          </span>
          <span>
            {t('cost.output', 'Out')}: {formatNumber(outputTokens)}
          </span>
        </div>
      </div>
    );
  }

  // Compact view
  return (
    <span className={`text-xs text-green-500/50 ${className}`}>
      ~{formatCost(cost)} ({formatNumber(totalTokens)} {t('cost.tokensLabel', 'tokens')})
    </span>
  );
}

/**
 * Props for CostEstimate component
 */
interface CostEstimateProps {
  /** Provider identifier */
  provider: string;
  /** Estimated number of tokens for the request */
  estimatedTokens: number;
  /** Cost per 1000 tokens for this provider */
  costPer1kTokens: number;
  /** Optional CSS class name */
  className?: string;
}

/**
 * CostEstimate Component
 *
 * Shows an estimated cost before making a request.
 * Useful for displaying expected costs in the UI before execution.
 */
export function CostEstimate({
  provider: _provider,
  estimatedTokens,
  costPer1kTokens,
  className = '',
}: CostEstimateProps) {
  // Provider is used for identification but not displayed in this component
  void _provider;
  const { t } = useTranslation();

  const estimatedCost = useMemo(() => {
    return (estimatedTokens / 1000) * costPer1kTokens;
  }, [estimatedTokens, costPer1kTokens]);

  if (costPer1kTokens === 0) {
    return (
      <span className={`text-xs text-green-500/50 ${className}`}>
        {t('cost.freeEstimate', 'Free (local model)')}
      </span>
    );
  }

  return (
    <span className={`text-xs text-green-500/50 ${className}`}>
      {t('cost.estimated', 'Est.')} ~{formatCost(estimatedCost)}
      <span className="text-green-500/30 ml-1">
        ({formatNumber(estimatedTokens)} {t('cost.tokensLabel', 'tokens')})
      </span>
    </span>
  );
}

/**
 * Props for CostSummary component
 */
interface CostSummaryProps {
  /** Array of costs by provider */
  costs: Array<{
    provider: string;
    tokens: number;
    cost: number;
  }>;
  /** Optional CSS class name */
  className?: string;
}

/**
 * CostSummary Component
 *
 * Shows a summary of costs across multiple providers.
 * Useful for dashboards and analytics views.
 */
export function CostSummary({ costs, className = '' }: CostSummaryProps) {
  const { t } = useTranslation();

  const { totalCost, totalTokens } = useMemo(() => {
    return costs.reduce(
      (acc, item) => ({
        totalCost: acc.totalCost + item.cost,
        totalTokens: acc.totalTokens + item.tokens,
      }),
      { totalCost: 0, totalTokens: 0 }
    );
  }, [costs]);

  if (costs.length === 0) {
    return (
      <div className={`text-xs text-green-500/30 ${className}`}>
        {t('cost.noData', 'No cost data available')}
      </div>
    );
  }

  return (
    <div className={`text-sm ${className}`}>
      <div className="flex items-center justify-between text-green-400">
        <span>{t('cost.totalLabel', 'Total Cost')}</span>
        <span className="font-medium">{formatCost(totalCost)}</span>
      </div>
      <div className="text-xs text-green-500/50 mt-1">
        {formatNumber(totalTokens)} {t('cost.totalTokens', 'total tokens')}
      </div>
      {costs.length > 1 && (
        <div className="mt-2 space-y-1">
          {costs.map((item, index) => (
            <div
              key={`${item.provider}-${index}`}
              className="flex items-center justify-between text-xs text-green-500/50"
            >
              <span>{item.provider}</span>
              <span>
                {formatCost(item.cost)} ({formatNumber(item.tokens)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Props for CostBadge component
 */
interface CostBadgeProps {
  /** Cost value to display */
  cost: number;
  /** Whether the provider is free (local) */
  isFree?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Optional CSS class name */
  className?: string;
}

/**
 * CostBadge Component
 *
 * A compact badge showing the cost.
 * Useful for displaying costs inline or in lists.
 */
export function CostBadge({
  cost,
  isFree = false,
  size = 'sm',
  className = '',
}: CostBadgeProps) {
  const { t } = useTranslation();

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-2.5 py-1.5',
  };

  if (isFree) {
    return (
      <span
        className={`
          ${sizeClasses[size]}
          bg-green-500/20 text-green-400 rounded
          ${className}
        `}
      >
        {t('cost.freeBadge', 'FREE')}
      </span>
    );
  }

  return (
    <span
      className={`
        ${sizeClasses[size]}
        bg-green-500/10 text-green-500/70 rounded font-mono
        ${className}
      `}
    >
      {formatCost(cost)}
    </span>
  );
}

export default CostDisplay;
