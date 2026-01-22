/**
 * PipelineStatus Component
 *
 * Displays the current state of the AI pipeline execution
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  Route,
  Lightbulb,
  ListTodo,
  Play,
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Brain,
} from 'lucide-react';
import type { PipelineStage, EvaluationResult } from '../lib/ai-pipeline';
import type { PipelineState } from '../hooks/usePipeline';

interface PipelineStatusProps {
  state: PipelineState;
  onCancel?: () => void;
}

const STAGE_CONFIG: Record<PipelineStage, {
  icon: typeof Route;
  label: string;
  provider: string;
  color: string;
}> = {
  ROUTE: {
    icon: Route,
    label: 'Route',
    provider: 'Web AI',
    color: 'text-blue-400',
  },
  SPECULATE: {
    icon: Lightbulb,
    label: 'Speculate',
    provider: 'Ollama',
    color: 'text-yellow-400',
  },
  PLAN: {
    icon: ListTodo,
    label: 'Plan',
    provider: 'Auto',
    color: 'text-purple-400',
  },
  EXECUTE: {
    icon: Play,
    label: 'Execute',
    provider: 'Ollama',
    color: 'text-green-400',
  },
  SYNTHESIZE: {
    icon: Sparkles,
    label: 'Synthesize',
    provider: 'Web AI',
    color: 'text-pink-400',
  },
  EVALUATE: {
    icon: Brain,
    label: 'Evaluate',
    provider: 'Web AI',
    color: 'text-cyan-400',
  },
};

const STAGES_ORDER: PipelineStage[] = [
  'ROUTE',
  'SPECULATE',
  'PLAN',
  'EXECUTE',
  'SYNTHESIZE',
  'EVALUATE',
];

export function PipelineStatus({ state, onCancel }: PipelineStatusProps) {
  if (!state.isRunning && !state.result) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="rounded-2xl bg-emerald-950/80 border border-emerald-400/30 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-emerald-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-100">
              AI Pipeline
            </h3>
            <p className="text-xs text-emerald-300/70">
              Iteration {state.currentIteration}/3
            </p>
          </div>
        </div>

        {state.isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 hover:bg-red-400/20 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2 rounded-full bg-emerald-900/50 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
            initial={{ width: 0 }}
            animate={{ width: `${state.progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-xs text-emerald-300/60 mt-1 text-right">
          {state.progress}%
        </p>
      </div>

      {/* Stages Grid */}
      <div className="grid grid-cols-6 gap-2 mb-4">
        {STAGES_ORDER.map((stage) => {
          const config = STAGE_CONFIG[stage];
          const Icon = config.icon;
          const isActive = state.currentStage === stage;
          const isComplete = state.stagesCompleted.includes(stage);

          return (
            <div
              key={stage}
              className={`
                flex flex-col items-center p-2 rounded-lg transition-all
                ${isActive ? 'bg-emerald-400/20 ring-1 ring-emerald-400/50' : ''}
                ${isComplete ? 'opacity-100' : 'opacity-50'}
              `}
            >
              <div className={`relative ${config.color}`}>
                <Icon className="w-5 h-5" />
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-current opacity-30"
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
                {isComplete && (
                  <CheckCircle2 className="absolute -top-1 -right-1 w-3 h-3 text-green-400" />
                )}
              </div>
              <span className="text-[10px] text-emerald-200/80 mt-1">
                {config.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current Stage Info */}
      {state.currentStage && state.isRunning && (
        <motion.div
          key={state.currentStage}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 p-3 rounded-lg bg-emerald-900/40 border border-emerald-400/20"
        >
          <RefreshCw className="w-4 h-4 text-emerald-300 animate-spin" />
          <div className="flex-1">
            <p className="text-sm text-emerald-100">
              {STAGE_CONFIG[state.currentStage].label}
            </p>
            <p className="text-xs text-emerald-300/60">
              Using: {state.currentModel || STAGE_CONFIG[state.currentStage].provider}
            </p>
          </div>
        </motion.div>
      )}

      {/* Evaluation Result */}
      <AnimatePresence>
        {state.latestEvaluation && (
          <EvaluationDisplay evaluation={state.latestEvaluation} />
        )}
      </AnimatePresence>

      {/* Error Display */}
      {state.error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30"
        >
          <div className="flex items-center gap-2 text-red-200">
            <XCircle className="w-4 h-4" />
            <span className="text-sm">{state.error}</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function EvaluationDisplay({ evaluation }: { evaluation: EvaluationResult }) {
  const metrics = [
    { label: 'Quality', value: evaluation.qualityScore },
    { label: 'Completeness', value: evaluation.completeness },
    { label: 'Accuracy', value: evaluation.accuracy },
    { label: 'Clarity', value: evaluation.clarity },
    { label: 'Usefulness', value: evaluation.usefulness },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-400';
    if (score >= 6) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-4 p-4 rounded-lg bg-emerald-900/30 border border-emerald-400/20"
    >
      <h4 className="text-xs font-semibold text-emerald-100 mb-3">
        Evaluation Results
      </h4>

      <div className="grid grid-cols-5 gap-2 mb-3">
        {metrics.map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className={`text-lg font-bold ${getScoreColor(value)}`}>
              {value}
            </div>
            <div className="text-[10px] text-emerald-300/60">{label}</div>
          </div>
        ))}
      </div>

      {evaluation.suggestions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-emerald-400/10">
          <p className="text-xs text-emerald-300/80 mb-1">Suggestions:</p>
          <ul className="text-xs text-emerald-200/60 space-y-1">
            {evaluation.suggestions.map((suggestion, i) => (
              <li key={i} className="flex gap-1">
                <span className="text-emerald-400">•</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.shouldRetry && (
        <div className="mt-3 flex items-center gap-2 text-yellow-400 text-xs">
          <RefreshCw className="w-3 h-3" />
          <span>Retrying with improvements...</span>
        </div>
      )}
    </motion.div>
  );
}

export default PipelineStatus;
