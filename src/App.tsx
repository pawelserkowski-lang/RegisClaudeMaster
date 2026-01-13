import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, BookOpen, Zap } from 'lucide-react';
import { ChatInterface } from './components/ChatInterface';
import { ResearchStatus } from './components/ResearchStatus';
import { useChat } from './lib/useChat';

function App() {
  const [input, setInput] = useState('');
  const { messages, isLoading, isResearching, sendMessage, error } = useChat();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const prompt = input.trim();
    setInput('');
    await sendMessage(prompt);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-zinc-900">
      {/* Header */}
      <header className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-950/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Regis Claude Master</h1>
              <p className="text-xs text-slate-500">AI-Powered Research Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Zap className="w-4 h-4 text-amber-500" />
            <span>Rust + React</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-32">
        {/* Empty State */}
        {messages.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-700 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-200 mb-2">
              Welcome to Regis
            </h2>
            <p className="text-slate-400 max-w-md mx-auto mb-8">
              Your AI research assistant powered by web grounding.
              Ask anything and I'll search, analyze, and respond.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                'Explain quantum computing',
                'Write a Python sorting function',
                'Compare REST vs GraphQL',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Research Status */}
        <AnimatePresence>
          {isResearching && <ResearchStatus />}
        </AnimatePresence>

        {/* Chat Messages */}
        <ChatInterface messages={messages} isLoading={isLoading} />

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Input Form */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pt-8 pb-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-4">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Regis anything..."
              disabled={isLoading}
              className="w-full px-6 py-4 pr-14 rounded-2xl bg-slate-800/80 border border-slate-700
                       text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2
                       focus:ring-amber-500/50 focus:border-amber-500/50 transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-xl
                       bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700
                       disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5 text-slate-900" />
            </button>
          </div>
          <p className="text-center text-xs text-slate-600 mt-3">
            Powered by Rust serverless functions + Google Grounding
          </p>
        </form>
      </div>
    </div>
  );
}

export default App;
