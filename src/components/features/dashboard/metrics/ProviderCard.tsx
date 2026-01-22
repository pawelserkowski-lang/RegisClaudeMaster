/**
 * Provider Card Component
 * Displays provider stats with expandable latency details
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, ChevronDown, ChevronUp } from 'lucide-react';
import type { ProviderLatencyBreakdown } from '../../../../types/metrics';
import { formatNumber, formatCurrency, formatLatency } from '../../../../lib/format';

interface ProviderCardProps {
  provider: string;
  requests: number;
  cost: number;
  latency?: ProviderLatencyBreakdown;
}

export function ProviderCard({ provider, requests, cost, latency }: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-emerald-900/40 border border-emerald-400/20 rounded-xl p-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-300" />
          <span className="font-medium text-emerald-100 capitalize">{provider}</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-emerald-300/70" />
        ) : (
          <ChevronDown className="w-4 h-4 text-emerald-300/70" />
        )}
      </button>

      <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
        <div>
          <p className="text-emerald-300/50">Requests</p>
          <p className="text-emerald-100 font-medium">{formatNumber(requests)}</p>
        </div>
        <div>
          <p className="text-emerald-300/50">Cost</p>
          <p className="text-emerald-100 font-medium">{formatCurrency(cost)}</p>
        </div>
      </div>

      <AnimatePresence>
        {expanded && latency && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-emerald-400/10 text-sm">
              <div>
                <p className="text-emerald-300/50">P50</p>
                <p className="text-emerald-100">{formatLatency(latency.p50)}</p>
              </div>
              <div>
                <p className="text-emerald-300/50">P95</p>
                <p className="text-emerald-100">{formatLatency(latency.p95)}</p>
              </div>
              <div>
                <p className="text-emerald-300/50">P99</p>
                <p className="text-emerald-100">{formatLatency(latency.p99)}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProviderCard;
