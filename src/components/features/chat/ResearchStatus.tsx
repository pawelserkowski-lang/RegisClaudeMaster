import { motion } from 'framer-motion';
import { Search, Globe, Database, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const steps = [
  { icon: Search, labelKey: 'status.steps.scan' },
  { icon: Globe, labelKey: 'status.steps.ground' },
  { icon: Database, labelKey: 'status.steps.analyze' },
  { icon: Sparkles, labelKey: 'status.steps.generate' },
];

const progressMessages = [
  'Wgrywam zielone cyfry...',
  'Stabilizuję strumień danych...',
  'Filtruję szum sieciowy...',
  'Łączę wątki informacji...',
];

export function ResearchStatus() {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 overflow-hidden"
    >
      <div className="p-6 rounded-2xl bg-emerald-950/60 border border-emerald-400/20 backdrop-blur">
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 0.3, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 rounded-lg bg-emerald-400/20 flex items-center justify-center border border-emerald-400/40"
          >
            <Search className="w-4 h-4 text-emerald-300" />
          </motion.div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-100">{t('status.title')}</h3>
            <p className="text-xs text-emerald-300/70">{t('status.subtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.labelKey}
              initial={{ opacity: 0.3, scale: 0.95 }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.95, 1, 0.95],
              }}
              transition={{
                duration: 0.3,
                repeat: Infinity,
                delay: index * 0.1,
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-emerald-900/40 border border-emerald-400/20"
            >
              <step.icon className="w-5 h-5 text-emerald-300" />
              <span className="text-xs font-medium text-emerald-100">{t(step.labelKey)}</span>
            </motion.div>
          ))}
        </div>

        {/* Animated progress bar */}
        <div className="mt-4 space-y-2">
          <div className="h-2 rounded-full bg-emerald-900/60 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-green-500"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 0.3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: '50%' }}
            />
          </div>
          <div className="relative h-6 overflow-hidden text-xs text-emerald-300/70">
            <motion.div
              className="absolute left-0 top-0 flex gap-6 whitespace-nowrap"
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: 0.3, repeat: Infinity, ease: 'linear' }}
            >
              {[...progressMessages, ...progressMessages].map((message, index) => (
                <span key={`${message}-${index}`} className="uppercase tracking-[0.2em]">
                  {message}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
