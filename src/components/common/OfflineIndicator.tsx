import { useTranslation } from 'react-i18next';

interface OfflineIndicatorProps {
  isOnline: boolean;
  queueLength: number;
  onSync?: () => void;
}

export function OfflineIndicator({ isOnline, queueLength, onSync }: OfflineIndicatorProps) {
  const { t } = useTranslation();

  if (isOnline && queueLength === 0) return null;

  return (
    <div className={`
      fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80
      p-3 rounded-lg shadow-lg backdrop-blur-sm
      ${isOnline
        ? 'bg-green-500/20 border border-green-500/30'
        : 'bg-yellow-500/20 border border-yellow-500/30'}
    `}>
      <div className="flex items-center gap-3">
        <span className={`text-xl ${isOnline ? 'animate-pulse' : ''}`}>
          {isOnline ? <SyncIcon /> : <OfflineIcon />}
        </span>
        <div className="flex-1">
          <div className={`text-sm font-medium ${isOnline ? 'text-green-300' : 'text-yellow-300'}`}>
            {isOnline
              ? t('offline.syncing', 'Syncing...')
              : t('offline.offline', "You're offline")}
          </div>
          {queueLength > 0 && (
            <div className="text-xs text-green-400/60">
              {t('offline.queued', '{{count}} messages queued', { count: queueLength })}
            </div>
          )}
        </div>
        {isOnline && queueLength > 0 && onSync && (
          <button
            onClick={onSync}
            className="text-xs px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded transition-colors"
          >
            {t('offline.syncNow', 'Sync now')}
          </button>
        )}
      </div>
    </div>
  );
}

// Simple icons to avoid external dependencies
function SyncIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-green-400"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function OfflineIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-yellow-400"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <line x1="12" x2="12.01" y1="20" y2="20" />
    </svg>
  );
}
