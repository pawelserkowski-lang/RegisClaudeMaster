import { useEffect, useState } from 'react';

interface ProgressIndicatorProps {
  isStreaming: boolean;
  tokensReceived?: number;
  estimatedTokens?: number;
}

export function ProgressIndicator({
  isStreaming,
  tokensReceived = 0,
  estimatedTokens = 500
}: ProgressIndicatorProps) {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setDots(d => d >= 3 ? 1 : d + 1);
    }, 400);

    return () => clearInterval(interval);
  }, [isStreaming]);

  if (!isStreaming) return null;

  const progress = Math.min(100, (tokensReceived / estimatedTokens) * 100);

  return (
    <div className="flex items-center gap-3 text-green-400/70 text-sm">
      {/* Animated dots */}
      <span className="font-mono">
        {'\u25B9'.repeat(dots)}{'\u25B8'.repeat(3 - dots)}
      </span>

      {/* Progress bar */}
      <div className="flex-1 h-1.5 bg-green-500/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Token count */}
      {tokensReceived > 0 && (
        <span className="text-xs tabular-nums">
          {tokensReceived} tokens
        </span>
      )}
    </div>
  );
}

// Typing indicator for assistant responses
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 text-green-400/50">
      <span className="w-2 h-2 rounded-full bg-current animate-pulse" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 rounded-full bg-current animate-pulse" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 rounded-full bg-current animate-pulse" style={{ animationDelay: '300ms' }} />
    </div>
  );
}
