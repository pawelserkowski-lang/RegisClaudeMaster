import { motion } from 'framer-motion';
import { Search, Globe, Database, Sparkles } from 'lucide-react';

const steps = [
  { icon: Search, label: 'Searching', description: 'Querying knowledge base...' },
  { icon: Globe, label: 'Grounding', description: 'Fetching web context...' },
  { icon: Database, label: 'Processing', description: 'Analyzing sources...' },
  { icon: Sparkles, label: 'Generating', description: 'Crafting response...' },
];

export function ResearchStatus() {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-6 overflow-hidden"
    >
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-800/50 via-slate-800/30 to-slate-800/50 border border-slate-700/50">
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center"
          >
            <Search className="w-4 h-4 text-amber-500" />
          </motion.div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Researching...</h3>
            <p className="text-xs text-slate-500">Gathering context from the web</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {steps.map((step, index) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0.3, scale: 0.95 }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.95, 1, 0.95],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: index * 0.5,
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/50"
            >
              <step.icon className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-medium text-slate-300">{step.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Animated progress bar */}
        <div className="mt-4 h-1 rounded-full bg-slate-700 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '50%' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
