import { motion } from 'framer-motion';
import { User, Bot, ExternalLink, Code, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Message } from '../lib/useChat';

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
}

export function ChatInterface({ messages, isLoading }: ChatInterfaceProps) {
  return (
    <div className="space-y-6">
      {messages.map((message, index) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={cn(
            'flex gap-4',
            message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          {/* Avatar */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              message.role === 'user'
                ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                : 'bg-gradient-to-br from-amber-500 to-orange-600'
            )}
          >
            {message.role === 'user' ? (
              <User className="w-5 h-5 text-white" />
            ) : (
              <Bot className="w-5 h-5 text-white" />
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
                'inline-block px-5 py-3 rounded-2xl',
                message.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-slate-800 text-slate-100 rounded-tl-sm'
              )}
            >
              {/* Code detection */}
              {message.content.includes('```') ? (
                <div className="text-left">
                  <CodeBlock content={message.content} />
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>

            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <FileText className="w-3 h-3" />
                  <span>Sources ({message.sources.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {message.sources.map((source, i) => (
                    <a
                      key={i}
                      href={source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg
                               bg-slate-800/50 hover:bg-slate-700/50 text-slate-400
                               hover:text-slate-300 text-xs transition-colors"
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
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <Code className="w-3 h-3" />
                <span>{message.modelUsed}</span>
              </div>
            )}
          </div>
        </motion.div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl rounded-tl-sm bg-slate-800">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-amber-500"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
            <span className="text-slate-500 text-sm">Thinking...</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
          const language = match?.[1] || 'code';
          const code = match?.[2] || '';

          return (
            <div key={i} className="rounded-lg overflow-hidden bg-slate-900/50">
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 text-xs text-slate-400">
                <span>{language}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="hover:text-slate-200 transition-colors"
                >
                  Copy
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-sm">
                <code className="text-slate-300">{code}</code>
              </pre>
            </div>
          );
        }
        return part ? <p key={i} className="whitespace-pre-wrap">{part}</p> : null;
      })}
    </div>
  );
}
