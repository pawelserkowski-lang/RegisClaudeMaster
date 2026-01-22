import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronUp,
  Star,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface GroundingSource {
  title: string;
  link: string;
  snippet?: string;
  relevanceScore?: number;
  domain?: string;
  timestamp?: string;
}

interface SourcesListProps {
  sources: GroundingSource[];
  qualityScore?: number;
  searchProvider?: string;
  fallbackUsed?: boolean;
  className?: string;
}

/**
 * Enhanced sources display component with quality indicators
 */
export function SourcesList({
  sources,
  qualityScore,
  searchProvider,
  fallbackUsed,
  className,
}: SourcesListProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (sources.length === 0) return null;

  const displaySources = isExpanded ? sources : sources.slice(0, 3);
  const hasMore = sources.length > 3;

  return (
    <div
      className={cn(
        'mt-4 border-t border-emerald-500/20 pt-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-medium text-emerald-300">
            {t('sources.title', 'Sources')} ({sources.length})
          </h4>
          {searchProvider && (
            <span className="text-xs text-emerald-400/50 px-2 py-0.5 rounded bg-emerald-500/10">
              {searchProvider}
            </span>
          )}
          {fallbackUsed && (
            <span
              className="text-xs text-yellow-400/70 px-2 py-0.5 rounded bg-yellow-500/10 inline-flex items-center gap-1"
              title={t('sources.fallbackUsed', 'Fallback provider used')}
            >
              <AlertCircle className="w-3 h-3" />
              {t('sources.fallback', 'Fallback')}
            </span>
          )}
        </div>
        {qualityScore !== undefined && (
          <QualityBadge score={qualityScore} />
        )}
      </div>

      {/* Sources List */}
      <ul className="space-y-2">
        <AnimatePresence mode="popLayout">
          {displaySources.map((source, idx) => (
            <motion.li
              key={source.link}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: idx * 0.05 }}
            >
              <SourceItem source={source} index={idx} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* Expand/Collapse Button */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-emerald-400/70 hover:text-emerald-300 transition-colors py-2 rounded-lg hover:bg-emerald-500/10"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              {t('sources.showLess', 'Show less')}
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              {t('sources.showMore', 'Show {{count}} more', {
                count: sources.length - 3,
              })}
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Individual source item component
 */
function SourceItem({
  source,
  index,
}: {
  source: GroundingSource;
  index: number;
}) {
  const { t } = useTranslation();

  return (
    <a
      href={source.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-3 rounded-lg hover:bg-emerald-500/10 transition-colors border border-transparent hover:border-emerald-500/20"
    >
      {/* Index Badge */}
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center">
        {index + 1}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h5 className="text-sm text-emerald-200 group-hover:text-emerald-100 transition-colors line-clamp-1">
            {source.title}
          </h5>
          <ExternalLink className="w-3.5 h-3.5 text-emerald-500/50 group-hover:text-emerald-400 transition-colors flex-shrink-0 mt-0.5" />
        </div>

        {/* Snippet */}
        {source.snippet && (
          <p className="text-xs text-emerald-400/60 mt-1 line-clamp-2">
            {source.snippet}
          </p>
        )}

        {/* Metadata Row */}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-emerald-500/50">
          {/* Domain */}
          {source.domain && (
            <span className="truncate max-w-[150px]">{source.domain}</span>
          )}

          {/* Relevance Score */}
          {source.relevanceScore !== undefined && (
            <span className="flex items-center gap-0.5">
              <Star className="w-3 h-3" />
              {Math.round(source.relevanceScore * 100)}%
            </span>
          )}

          {/* Timestamp */}
          {source.timestamp && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {t('sources.fetched', 'Fetched now')}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

/**
 * Quality score badge component
 */
function QualityBadge({ score }: { score: number }) {
  const { t } = useTranslation();

  const getQualityLevel = (s: number) => {
    if (s >= 0.7) return { label: t('sources.qualityHigh', 'High'), color: 'emerald' };
    if (s >= 0.4) return { label: t('sources.qualityMedium', 'Medium'), color: 'yellow' };
    return { label: t('sources.qualityLow', 'Low'), color: 'red' };
  };

  const quality = getQualityLevel(score);

  const colorClasses = {
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span
      className={cn(
        'text-xs px-2 py-0.5 rounded border inline-flex items-center gap-1',
        colorClasses[quality.color as keyof typeof colorClasses]
      )}
      title={t('sources.qualityTooltip', 'Source quality based on relevance and diversity')}
    >
      <Star className="w-3 h-3" />
      {t('sources.quality', 'Quality')}: {Math.round(score * 100)}%
    </span>
  );
}

/**
 * Compact sources display for inline use
 */
export function SourcesListCompact({
  sources,
  className,
}: {
  sources: GroundingSource[];
  className?: string;
}) {
  const { t } = useTranslation();

  if (sources.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {sources.slice(0, 3).map((source) => (
        <a
          key={source.link}
          href={source.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200/70 hover:text-emerald-100 text-xs transition-colors border border-emerald-400/20"
        >
          <ExternalLink className="w-3 h-3" />
          <span className="max-w-[150px] truncate">{source.title}</span>
          {source.relevanceScore !== undefined && source.relevanceScore >= 0.7 && (
            <Star className="w-3 h-3 text-yellow-400/70" />
          )}
        </a>
      ))}
      {sources.length > 3 && (
        <span className="text-xs text-emerald-400/50 px-2 py-1.5">
          +{sources.length - 3} {t('sources.more', 'more')}
        </span>
      )}
    </div>
  );
}
