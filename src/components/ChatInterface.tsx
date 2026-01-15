import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, ExternalLink, Code, FileText, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useTranslation } from 'react-i18next';
import { cn, copyToClipboard, formatRelativeTime } from '../lib/utils';
import type { Message } from '../lib/types';
import { SkeletonMessage } from './SkeletonMessage';

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
}

export function ChatInterface({ messages, isLoading }: ChatInterfaceProps) {
  const { t, i18n } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (code: string, key: string) => {
    const success = await copyToClipboard(code);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    }
  };

  return (
    <div className="space-y-6">
      {messages.map((message, index) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
          className={cn(
            'flex gap-4',
            message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          {/* Avatar */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 border',
              message.role === 'user'
                ? 'bg-emerald-400/20 border-emerald-400/50'
                : 'bg-emerald-500/20 border-emerald-300/50'
            )}
          >
            {message.role === 'user' ? (
              <User className="w-5 h-5 text-emerald-200" />
            ) : (
              <Bot className="w-5 h-5 text-emerald-200" />
            )}
          </div>

          {/* Message Content */}
          <div
            className={cn(
              'flex-1 max-w-[80%]',
              message.role === 'user' ? 'text-right' : 'text-left'
            )}
          >
            <div
              className={cn(
                'inline-block px-5 py-3 rounded-2xl border',
                message.role === 'user'
                  ? 'bg-emerald-400/20 text-emerald-100 border-emerald-400/40 rounded-tr-sm'
                  : 'bg-emerald-950/60 text-emerald-100 border-emerald-400/20 rounded-tl-sm'
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  a({ children, href }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-200 underline">
                        {children}
                      </a>
                    );
                  },
                  code({ className, children }) {
                    const isInline = !className;
                    if (isInline) {
                      return <code className="text-emerald-200/90">{children}</code>;
                    }
                    const language = className?.replace('language-', '') || 'text';
                    const code = String(children).replace(/\n$/, '');
                    const copyKey = `${message.id}-${language}`;
                    const isCopied = copiedKey === copyKey;
                    return (
                      <div className="rounded-lg overflow-hidden bg-emerald-950/70 border border-emerald-400/20">
                        <div className="flex items-center justify-between px-4 py-2 bg-emerald-900/60 text-xs text-emerald-200/70">
                          <span>{language}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(code, copyKey)}
                            className="hover:text-emerald-100 transition-colors inline-flex items-center gap-1"
                          >
                            {isCopied ? <Check className="w-3 h-3" /> : null}
                            {isCopied ? t('messages.copied') : t('messages.copy')}
                          </button>
                        </div>
                        <pre className="p-4 overflow-x-auto text-sm">
                          <code className={className}>{children}</code>
                        </pre>
                      </div>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-300/70">
                  <FileText className="w-3 h-3" />
                  <span>{t('messages.sources', { count: message.sources.length })}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {message.sources.map((source, i) => (
                    <a
                      key={i}
                      href={source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg
                               bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200/70
                               hover:text-emerald-100 text-xs transition-colors border border-emerald-400/20"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="max-w-[150px] truncate">{source.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Model info */}
            {message.modelUsed && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300/60">
                <Code className="w-3 h-3" />
                <span>{t('messages.modelUsed', { model: message.modelUsed })}</span>
              </div>
            )}

            <div className="mt-2 text-[11px] text-emerald-300/50">
              {t('messages.timestamp', { time: formatRelativeTime(message.timestamp, i18n.language) })}
            </div>
          </div>
        </motion.div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-400/20 border border-emerald-400/50 flex items-center justify-center">
              <Bot className="w-5 h-5 text-emerald-200" />
            </div>
            <div className="flex-1">
              <SkeletonMessage />
            </div>
          </div>
          <p className="text-sm text-emerald-300/70">{t('messages.thinking')}</p>
        </motion.div>
      )}
    </div>
  );
}
