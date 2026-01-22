/**
 * Error Row Component
 * Displays a single error entry in the errors list
 */

import { XCircle } from 'lucide-react';
import type { RequestMetric } from '../../../../types/metrics';
import { formatRelativeTime, formatLatency } from '../../../../lib/format';

interface ErrorRowProps {
  error: RequestMetric;
}

export function ErrorRow({ error }: ErrorRowProps) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 bg-red-500/5 rounded-lg border border-red-500/20">
      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-emerald-100 truncate">
          {error.provider} / {error.model}
        </p>
        <p className="text-xs text-emerald-300/50">
          {error.errorType ?? 'Unknown error'} | {formatRelativeTime(error.timestamp)}
        </p>
      </div>
      <span className="text-xs text-emerald-300/50">{formatLatency(error.latency)}</span>
    </div>
  );
}

export default ErrorRow;
