import { useTranslation } from 'react-i18next';
import { ErrorCode, getRecoverySuggestions } from '../../../api/_lib/utils/errors';
import type { ApiError } from '../../../api/_lib/utils/errors';

interface ErrorDisplayProps {
  error: ApiError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Get appropriate icon for error type
 */
function getErrorIcon(code: ErrorCode): string {
  switch (code) {
    case ErrorCode.RATE_LIMITED:
      return '\u23F1'; // Timer
    case ErrorCode.NETWORK_ERROR:
    case ErrorCode.TIMEOUT:
      return '\uD83C\uDF10'; // Globe
    case ErrorCode.AUTH_EXPIRED:
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.AUTH_INVALID:
      return '\uD83D\uDD10'; // Locked
    case ErrorCode.PROVIDER_UNAVAILABLE:
    case ErrorCode.ALL_PROVIDERS_FAILED:
    case ErrorCode.PROVIDER_ERROR:
    case ErrorCode.PROVIDER_TIMEOUT:
      return '\uD83E\uDD16'; // Robot
    case ErrorCode.GROUNDING_FAILED:
      return '\uD83D\uDD0D'; // Magnifier
    case ErrorCode.INVALID_PROMPT:
    case ErrorCode.BAD_REQUEST:
      return '\u270F'; // Pencil
    case ErrorCode.PAYLOAD_TOO_LARGE:
      return '\uD83D\uDCE6'; // Package
    default:
      return '\u26A0'; // Warning
  }
}

/**
 * Get CSS class based on error severity
 */
function getErrorSeverity(code: ErrorCode): 'error' | 'warning' | 'info' {
  switch (code) {
    case ErrorCode.GROUNDING_FAILED:
      return 'info';
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.PROVIDER_TIMEOUT:
    case ErrorCode.TIMEOUT:
      return 'warning';
    default:
      return 'error';
  }
}

/**
 * User-friendly error display component
 * Shows error message, recovery suggestions, and retry/dismiss actions
 */
export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  const { t } = useTranslation();
  const suggestions = getRecoverySuggestions(error);
  const severity = getErrorSeverity(error.code);
  const icon = getErrorIcon(error.code);

  const severityStyles = {
    error: {
      container: 'bg-red-500/10 border-red-500/30',
      title: 'text-red-300',
      text: 'text-red-200/70',
      icon: 'text-green-400',
      retryBtn: 'bg-green-600 hover:bg-green-500 text-white',
      dismissBtn: 'hover:bg-red-500/20 text-red-300 border-red-500/30',
    },
    warning: {
      container: 'bg-yellow-500/10 border-yellow-500/30',
      title: 'text-yellow-300',
      text: 'text-yellow-200/70',
      icon: 'text-green-400',
      retryBtn: 'bg-green-600 hover:bg-green-500 text-white',
      dismissBtn: 'hover:bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    },
    info: {
      container: 'bg-blue-500/10 border-blue-500/30',
      title: 'text-blue-300',
      text: 'text-blue-200/70',
      icon: 'text-green-400',
      retryBtn: 'bg-green-600 hover:bg-green-500 text-white',
      dismissBtn: 'hover:bg-blue-500/20 text-blue-300 border-blue-500/30',
    },
  };

  const styles = severityStyles[severity];

  // Try to get translated error message, fall back to error.message
  const translatedTitle = t(`errors.${error.code}.title`, {
    defaultValue: error.message,
  });
  const translatedMessage = t(`errors.${error.code}.message`, {
    defaultValue: '',
  });

  return (
    <div
      className={`${styles.container} border rounded-lg p-4 my-4`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0" role="img" aria-hidden="true">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className={`${styles.title} font-medium`}>{translatedTitle}</h4>

          {translatedMessage && (
            <p className={`${styles.text} text-sm mt-1`}>{translatedMessage}</p>
          )}

          {error.details && Object.keys(error.details).length > 0 && (
            <details className="mt-2">
              <summary
                className={`${styles.text} text-sm cursor-pointer hover:underline`}
              >
                {t('errors.showDetails', 'Show details')}
              </summary>
              <pre className={`${styles.text} text-xs mt-1 overflow-x-auto`}>
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </details>
          )}

          {suggestions.length > 0 && (
            <ul className="mt-3 space-y-1" aria-label="Recovery suggestions">
              {suggestions.map((suggestion: string, idx: number) => (
                <li
                  key={idx}
                  className={`${styles.text} text-sm flex items-center gap-2`}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {'\u2192'}
                  </span>
                  {suggestion}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex gap-2 flex-wrap">
            {error.retryable && onRetry && (
              <button
                onClick={onRetry}
                className={`${styles.retryBtn} px-3 py-1.5 text-sm rounded transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-black`}
                aria-label={t('common.retry', 'Try Again')}
              >
                {t('common.retry', 'Try Again')}
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className={`${styles.dismissBtn} px-3 py-1.5 bg-transparent text-sm rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-black`}
                aria-label={t('common.dismiss', 'Dismiss')}
              >
                {t('common.dismiss', 'Dismiss')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline error display for form fields
 */
interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className = '' }: InlineErrorProps) {
  return (
    <span
      className={`text-red-400 text-sm flex items-center gap-1 ${className}`}
      role="alert"
    >
      <span aria-hidden="true">{'\u26A0'}</span>
      {message}
    </span>
  );
}

/**
 * Toast-style error notification
 */
interface ErrorToastProps {
  error: ApiError;
  onDismiss: () => void;
  autoHideDuration?: number;
}

export function ErrorToast({
  error,
  onDismiss,
  autoHideDuration = 5000,
}: ErrorToastProps) {
  const { t } = useTranslation();
  const icon = getErrorIcon(error.code);

  // Auto-dismiss after duration (if not a critical error)
  if (autoHideDuration > 0 && error.retryable) {
    setTimeout(onDismiss, autoHideDuration);
  }

  return (
    <div
      className="fixed bottom-4 right-4 max-w-sm bg-gray-900 border border-red-500/50 rounded-lg shadow-lg p-4 animate-slide-up z-50"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">
          {icon}
        </span>
        <div className="flex-1">
          <p className="text-red-300 font-medium text-sm">
            {t(`errors.${error.code}.title`, error.message)}
          </p>
          {error.suggestedAction && (
            <p className="text-gray-400 text-xs mt-1">{error.suggestedAction}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={t('common.dismiss', 'Dismiss')}
        >
          {'\u2715'}
        </button>
      </div>
    </div>
  );
}

export default ErrorDisplay;
