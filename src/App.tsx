import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, BookOpen, Zap, Sun, Moon, Globe, Trash2, Languages } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChatInterface } from './components/ChatInterface';
import { ResearchStatus } from './components/ResearchStatus';
import { executePrompt } from './lib/api-client';
import type { Message } from './lib/types';
import { fetchModels, type ModelInfo } from './lib/models';
import { fetchHealth } from './lib/health';
import { loadLatestBackup, saveBackup } from './lib/storage';
import { usePreferencesStore } from './lib/preferences-store';

function App() {
  const { theme, setTheme, language, setLanguage } = usePreferencesStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [history, setHistory] = useState<Message[][]>([]);
  const [redoStack, setRedoStack] = useState<Message[][]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        prompt: z.string().min(3, t('forms.inputMin')).nonempty(t('forms.inputRequired')),
      }),
    [t]
  );

  const { register, handleSubmit, reset, formState } = useForm<{ prompt: string }>({
    resolver: zodResolver(schema),
    mode: 'onChange',
  });
  const promptRegister = register('prompt');

  const { data: models } = useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: fetchModels,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 300000,
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const stored = localStorage.getItem('regis-theme');
    const initialTheme = stored === 'light' || stored === 'dark' ? stored : media.matches ? 'light' : 'dark';
    setTheme(initialTheme);
    setLanguage((localStorage.getItem('regis-language') as 'pl' | 'en') ?? 'pl');
    document.documentElement.dataset.theme = initialTheme;

    const handleChange = (event: MediaQueryListEvent) => {
      const nextTheme = event.matches ? 'light' : 'dark';
      setTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
    };

    media.addEventListener('change', handleChange);
    return () => {
      media.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('regis-theme', theme);
  }, [theme]);

  useEffect(() => {
    void i18n.changeLanguage(language);
    localStorage.setItem('regis-language', language);
  }, [i18n, language]);

  useEffect(() => {
    let isMounted = true;
    loadLatestBackup()
      .then((stored) => {
        if (stored && isMounted) {
          setMessages(stored);
        }
      })
      .catch((err) => console.warn('Backup restore failed', err));
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      saveBackup(messages).catch((err) => console.warn('Backup failed', err));
    }, 300000);
    return () => clearInterval(interval);
  }, [messages]);

  useEffect(() => {
    const timeout = setTimeout(() => setShowErrors(true), 300);
    return () => {
      setShowErrors(false);
      clearTimeout(timeout);
    };
  }, [formState.errors]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        handleClearChat();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages, history, redoStack]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleClearChat = () => {
    if (messages.length === 0) return;
    setHistory((prev) => [...prev, messages]);
    setRedoStack([]);
    setMessages([]);
    setError(null);
  };

  const handleUndo = () => {
    const previous = history.length > 0 ? history[history.length - 1] : undefined;
    if (!previous) return;
    setHistory((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, messages]);
    setMessages(previous);
  };

  const handleRedo = () => {
    const next = redoStack.length > 0 ? redoStack[redoStack.length - 1] : undefined;
    if (!next) return;
    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, messages]);
    setMessages(next);
  };

  const onSubmit = async ({ prompt }: { prompt: string }) => {
    if (isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: prompt.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setRedoStack([]);
    setIsLoading(true);
    setIsResearching(true);
    setError(null);
    reset();

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setIsResearching(false);

      const response = await executePrompt(prompt, selectedModel, controller.signal);

      const assistantMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: 'assistant',
        content: response.response,
        sources: response.sources,
        modelUsed: response.model_used,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'UNKNOWN';
      const mapped =
        message === 'AUTH_ERROR'
          ? t('errors.auth')
          : message === 'TIMEOUT'
          ? t('errors.timeout')
          : message === 'RATE_LIMIT'
          ? t('errors.rateLimit')
          : t('errors.unknown');
      setError(mapped);
    } finally {
      setIsLoading(false);
      setIsResearching(false);
    }
  };

  return (
    <div className="min-h-screen text-emerald-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-emerald-400/20 bg-emerald-950/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-400/20 flex items-center justify-center border border-emerald-400/40">
              <img
                src="https://pawelserkowski.pl/logo.webp"
                alt="Logo Regis"
                className="w-8 h-8"
                loading="lazy"
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-emerald-100">{t('app.title')}</h1>
              <p className="text-xs text-emerald-300/70">{t('app.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-emerald-200/80 text-sm">
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-400/10 border border-emerald-400/30">
              <Zap className="w-4 h-4 text-emerald-300" />
              <span>Funkcje Edge + React 19</span>
            </div>
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-full border ${
                isOnline
                  ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200/80'
                  : 'bg-red-400/10 border-red-400/30 text-red-200'
              }`}
            >
              <span>{isOnline ? t('statusLabels.online') : t('statusLabels.offline')}</span>
            </div>
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full border border-emerald-400/30 bg-emerald-950/60 hover:bg-emerald-900/70 transition-colors"
              aria-label={theme === 'dark' ? t('app.themeLight') : t('app.themeDark')}
              title={theme === 'dark' ? t('app.themeLight') : t('app.themeDark')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-emerald-200" />
              ) : (
                <Moon className="w-4 h-4 text-emerald-200" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setLanguage(language === 'pl' ? 'en' : 'pl')}
              className="p-2 rounded-full border border-emerald-400/30 bg-emerald-950/60 hover:bg-emerald-900/70 transition-colors"
              aria-label="Zmień język"
              title="Zmień język"
            >
              <Languages className="w-4 h-4 text-emerald-200" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 pb-36">
        {/* Empty State */}
        {messages.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-emerald-300" />
            </div>
            <h2 className="text-2xl font-semibold text-emerald-100 mb-2">{t('app.welcomeTitle')}</h2>
            <p className="text-emerald-200/70 max-w-md mx-auto mb-8">{t('app.welcomeBody')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                'Wyjaśnij komputery kwantowe',
                'Napisz sortowanie w Pythonie',
                'Porównaj REST vs GraphQL',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    reset({ prompt: suggestion });
                    inputRef.current?.focus();
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 text-sm transition-colors border border-emerald-400/20"
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

        {health && (
          <section className="mt-10 rounded-2xl bg-emerald-950/60 border border-emerald-400/20 p-6">
            <div className="flex items-center gap-2 mb-4 text-emerald-100">
              <Globe className="w-4 h-4 text-emerald-300" />
              <h3 className="text-sm font-semibold">{t('health.title')}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-emerald-200/80">
              {health.providers.map((provider) => (
                <div
                  key={provider.model}
                  className="rounded-xl border border-emerald-400/20 bg-emerald-900/40 p-3"
                >
                  <p className="text-emerald-100 font-semibold">{provider.model}</p>
                  <p>{t('health.status')}: {provider.status}</p>
                  <p>{t('health.tokens')}: {provider.tokens}</p>
                  <p>{t('health.cost')}: ${provider.cost.toFixed(4)}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Input Form */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-950 via-emerald-950/95 to-transparent pt-8 pb-6">
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-5xl mx-auto px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs text-emerald-300/70">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearChat}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-400/20 bg-emerald-950/60 hover:bg-emerald-900/70"
                title={`${t('app.clearChat')} (${t('app.clearChatShortcut')})`}
              >
                <Trash2 className="w-3 h-3" />
                {t('app.clearChat')}
              </button>
              <span className="inline-flex items-center gap-1">
                <span>{t('app.shortcuts')}:</span>
                <span>{t('app.focusInputShortcut')}</span>
                <span>{t('app.clearChatShortcut')}</span>
                <span>{t('app.undoShortcut')}</span>
                <span>{t('app.redoShortcut')}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-emerald-300/70" htmlFor="model-select">
                {t('labels.model')}
              </label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                className="rounded-lg bg-emerald-950/60 border border-emerald-400/30 px-3 py-1 text-emerald-100"
              >
                <option value="auto">Auto</option>
                {models?.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              {...promptRegister}
              placeholder={t('app.inputPlaceholder')}
              disabled={isLoading}
              ref={(element) => {
                promptRegister.ref(element);
                inputRef.current = element;
              }}
              className="w-full px-6 py-4 pr-14 rounded-2xl bg-emerald-950/70 border border-emerald-400/30
                       text-emerald-50 placeholder:text-emerald-300/60 focus:outline-none focus:ring-2
                       focus:ring-emerald-400/50 focus:border-emerald-300/70 transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!formState.isValid || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-xl
                       bg-emerald-400 hover:bg-emerald-300 disabled:bg-emerald-900
                       disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5 text-emerald-950" />
            </button>
          </div>
          {showErrors && formState.errors.prompt && (
            <p className="mt-2 text-xs text-red-300">{formState.errors.prompt.message}</p>
          )}
          <p className="text-center text-xs text-emerald-300/60 mt-3">
            {t('app.poweredBy')}
          </p>
        </form>
      </div>
    </div>
  );
}

export default App;
