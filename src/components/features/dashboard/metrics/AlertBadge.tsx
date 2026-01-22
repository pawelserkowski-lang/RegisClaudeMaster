/**
 * Alert Badge Component
 * Displays individual alert with severity styling
 */

import { motion } from 'framer-motion';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import type { Alert } from '../../../../types/metrics';
import { formatRelativeTime } from '../../../../lib/format';

interface AlertBadgeProps {
  alert: Alert;
}

export function AlertBadge({ alert }: AlertBadgeProps) {
  const isCritical = alert.severity === 'critical';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`flex items-start gap-3 p-4 rounded-xl border ${
        isCritical
          ? 'bg-red-500/10 border-red-500/30 text-red-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
      }`}
    >
      {isCritical ? (
        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium">{alert.message}</p>
        <p className="text-xs opacity-70 mt-1">
          {formatRelativeTime(alert.timestamp)} | Value: {alert.value.toFixed(2)} | Threshold: {alert.threshold}
        </p>
      </div>
    </motion.div>
  );
}

export default AlertBadge;
