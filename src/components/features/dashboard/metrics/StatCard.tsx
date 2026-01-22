/**
 * Stat Card Component
 * Displays a single metric with icon, value, and optional trend
 */

import { TrendingUp, ChevronDown } from 'lucide-react';

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  colorClass?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  colorClass = 'text-emerald-300',
}: StatCardProps) {
  return (
    <div className="bg-emerald-950/60 border border-emerald-400/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <span className="text-emerald-300/70 text-sm">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-emerald-100">{value}</span>
        {trend && (
          <span
            className={`text-xs ${
              trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-emerald-300/50'
            }`}
          >
            {trend === 'up' ? (
              <TrendingUp className="w-3 h-3 inline" />
            ) : trend === 'down' ? (
              <ChevronDown className="w-3 h-3 inline" />
            ) : (
              '-'
            )}
          </span>
        )}
      </div>
      {subValue && <p className="text-xs text-emerald-300/50 mt-1">{subValue}</p>}
    </div>
  );
}

export default StatCard;
