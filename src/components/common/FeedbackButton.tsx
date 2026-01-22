import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface FeedbackButtonProps {
  messageId: string;
  onFeedback: (messageId: string, rating: 'positive' | 'negative', comment?: string) => void;
}

export function FeedbackButton({ messageId, onFeedback }: FeedbackButtonProps) {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
  const [comment, setComment] = useState('');

  const handleRating = (newRating: 'positive' | 'negative') => {
    setRating(newRating);
    if (newRating === 'negative') {
      setShowComment(true);
    } else {
      onFeedback(messageId, newRating);
      setSubmitted(true);
    }
  };

  const submitWithComment = () => {
    if (rating) {
      onFeedback(messageId, rating, comment);
      setSubmitted(true);
      setShowComment(false);
    }
  };

  if (submitted) {
    return (
      <span className="text-xs text-green-500/50">
        {t('feedback.thanks', 'Thanks!')} ✓
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!showComment ? (
        <>
          <button
            onClick={() => handleRating('positive')}
            className="p-1 hover:bg-green-500/10 rounded transition-colors text-green-500/50 hover:text-green-400"
            title={t('feedback.helpful', 'Helpful')}
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleRating('negative')}
            className="p-1 hover:bg-red-500/10 rounded transition-colors text-green-500/50 hover:text-red-400"
            title={t('feedback.notHelpful', 'Not helpful')}
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('feedback.whatWrong', 'What went wrong?')}
            className="text-xs bg-black/30 border border-red-500/30 rounded px-2 py-1 text-green-300 placeholder-green-500/30 focus:outline-none focus:border-red-500/50"
            autoFocus
          />
          <button
            onClick={submitWithComment}
            className="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
          >
            {t('common.send', 'Send')}
          </button>
        </div>
      )}
    </div>
  );
}

// Simple thumbs up/down icons to avoid external dependencies
function ThumbsUp({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}

function ThumbsDown({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}
