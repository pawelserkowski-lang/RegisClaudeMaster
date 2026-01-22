/**
 * usePipeline Hook
 *
 * React hook for executing the AI pipeline with feedback loop
 */

import { useState, useCallback, useRef } from 'react';
import {
  executePipeline,
  type PipelineResult,
  type PipelineStage,
  type EvaluationResult,
} from '../lib/ai-pipeline';
import type { AIModel } from '../lib/ai-providers';

export interface PipelineState {
  // Execution state
  isRunning: boolean;
  currentStage: PipelineStage | null;
  currentIteration: number;

  // Progress
  stagesCompleted: PipelineStage[];
  progress: number; // 0-100

  // Results
  result: PipelineResult | null;
  latestEvaluation: EvaluationResult | null;

  // Errors
  error: string | null;

  // Metadata
  currentModel: string | null;
  stageDurations: Partial<Record<PipelineStage, number>>;
}

export interface UsePipelineReturn {
  // State
  state: PipelineState;

  // Actions
  execute: (prompt: string) => Promise<PipelineResult | null>;
  cancel: () => void;
  reset: () => void;

  // Derived state
  isComplete: boolean;
  qualityScore: number | null;
}

const STAGES_ORDER: PipelineStage[] = [
  'ROUTE',
  'SPECULATE',
  'PLAN',
  'EXECUTE',
  'SYNTHESIZE',
  'EVALUATE',
];

const initialState: PipelineState = {
  isRunning: false,
  currentStage: null,
  currentIteration: 0,
  stagesCompleted: [],
  progress: 0,
  result: null,
  latestEvaluation: null,
  error: null,
  currentModel: null,
  stageDurations: {},
};

export function usePipeline(): UsePipelineReturn {
  const [state, setState] = useState<PipelineState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);

  const calculateProgress = useCallback((
    stage: PipelineStage,
    iteration: number,
    maxIterations: number
  ): number => {
    const stageIndex = STAGES_ORDER.indexOf(stage);
    const stagesPerIteration = STAGES_ORDER.length;
    const totalStages = stagesPerIteration * maxIterations;

    const completedStages = (iteration - 1) * stagesPerIteration + stageIndex;
    return Math.round((completedStages / totalStages) * 100);
  }, []);

  const execute = useCallback(async (prompt: string): Promise<PipelineResult | null> => {
    // Reset state
    isCancelledRef.current = false;
    abortControllerRef.current = new AbortController();

    setState({
      ...initialState,
      isRunning: true,
      currentIteration: 1,
    });

    try {
      const result = await executePipeline(prompt, {
        onStageStart: (stage, iteration) => {
          if (isCancelledRef.current) return;

          setState(prev => ({
            ...prev,
            currentStage: stage,
            currentIteration: iteration,
            progress: calculateProgress(stage, iteration, 3),
          }));
        },

        onStageComplete: (stage, stageResult) => {
          if (isCancelledRef.current) return;

          setState(prev => ({
            ...prev,
            stagesCompleted: [...prev.stagesCompleted, stage],
            stageDurations: {
              ...prev.stageDurations,
              [stage]: stageResult.duration,
            },
          }));
        },

        onIterationComplete: (iteration, evaluation) => {
          if (isCancelledRef.current) return;

          setState(prev => ({
            ...prev,
            latestEvaluation: evaluation,
          }));

          console.info(
            `[usePipeline] Iteration ${iteration} complete: score=${evaluation.qualityScore}/10`
          );
        },

        onModelChange: (model: AIModel) => {
          if (isCancelledRef.current) return;

          setState(prev => ({
            ...prev,
            currentModel: `${model.provider}/${model.id}`,
          }));
        },
      });

      if (isCancelledRef.current) {
        return null;
      }

      setState(prev => ({
        ...prev,
        isRunning: false,
        result,
        progress: 100,
        currentStage: null,
      }));

      return result;

    } catch (error) {
      if (isCancelledRef.current) {
        return null;
      }

      const message = error instanceof Error ? error.message : 'Pipeline execution failed';

      setState(prev => ({
        ...prev,
        isRunning: false,
        error: message,
        currentStage: null,
      }));

      console.error('[usePipeline] Error:', message);
      return null;
    }
  }, [calculateProgress]);

  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    abortControllerRef.current?.abort();

    setState(prev => ({
      ...prev,
      isRunning: false,
      error: 'Pipeline cancelled by user',
    }));
  }, []);

  const reset = useCallback(() => {
    isCancelledRef.current = true;
    abortControllerRef.current?.abort();
    setState(initialState);
  }, []);

  const isComplete = !state.isRunning && state.result !== null;
  const qualityScore = state.result?.context.finalEvaluation?.qualityScore ?? null;

  return {
    state,
    execute,
    cancel,
    reset,
    isComplete,
    qualityScore,
  };
}

export default usePipeline;
