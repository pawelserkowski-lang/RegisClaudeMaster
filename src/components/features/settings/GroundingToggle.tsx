import { useTranslation } from 'react-i18next';
import { Search, SearchX } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface GroundingToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Toggle component for enabling/disabling web search grounding
 */
export function GroundingToggle({
  enabled,
  onChange,
  disabled = false,
  className,
}: GroundingToggleProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('grounding.toggle', 'Toggle web search')}
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-emerald-950',
          enabled ? 'bg-emerald-600' : 'bg-gray-600',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      <div className="flex items-center gap-1.5">
        {enabled ? (
          <Search className="w-4 h-4 text-emerald-400" />
        ) : (
          <SearchX className="w-4 h-4 text-emerald-300/50" />
        )}
        <span
          className={cn(
            'text-sm transition-colors',
            enabled ? 'text-emerald-300' : 'text-emerald-300/50'
          )}
        >
          {t('grounding.label', 'Web Search')}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact version of the grounding toggle for use in toolbars
 */
export function GroundingToggleCompact({
  enabled,
  onChange,
  disabled = false,
}: Omit<GroundingToggleProps, 'className'>) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors',
        enabled
          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30'
          : 'bg-emerald-950/60 border-emerald-400/20 text-emerald-300/60 hover:bg-emerald-900/70',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      title={
        enabled
          ? t('grounding.disableHint', 'Disable web search')
          : t('grounding.enableHint', 'Enable web search')
      }
    >
      {enabled ? (
        <Search className="w-3.5 h-3.5" />
      ) : (
        <SearchX className="w-3.5 h-3.5" />
      )}
      <span className="text-xs">
        {enabled
          ? t('grounding.enabled', 'Search On')
          : t('grounding.disabled', 'Search Off')}
      </span>
    </button>
  );
}
