/**
 * Chat State Hook
 * Manages chat messages, history, undo/redo, and message submission
 *
 * Extracted from App.tsx to improve separation of concerns
 * Now supports AI Pipeline with feedback loop
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { executePrompt } from '../lib/api-client';
import { loadLatestBackup, saveBackup } from '../lib/storage';
import { executePipeline, type PipelineStage, type EvaluationResult } from '../lib/ai-pipeline';
import type { Message } from '../lib/types';
import type { AIModel } from '../lib/ai-providers';

interface UseChatStateOptions {
  autoBackupInterval?: number; // ms, default 5 minutes
  usePipeline?: boolean; // Use advanced AI pipeline (default: true)
}

export interface PipelineProgress {
  isRunning: boolean;
  currentStage: PipelineStage | null;
  currentIteration: number;
  progress: number;
  currentModel: string | null;
  stagesCompleted: PipelineStage[];
  evaluation: EvaluationResult | null;
}

interface UseChatStateReturn {
  // State
  messages: Message[];
  isLoading: boolean;
  isResearching: boolean;
  error: string | null;

  // Pipeline state
  pipelineProgress: PipelineProgress;

  // Computed
  canUndo: boolean;
  canRedo: boolean;
  isEmpty: boolean;

  // Actions
  sendMessage: (prompt: string, model?: string) => Promise<void>;
  clearChat: () => void;
  undo: () => void;
  redo: () => void;
  clearError: () => void;
  cancelRequest: () => void;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Map error codes to translated messages
 */
function mapErrorMessage(error: unknown, t: (key: string) => string): string {
  const message = error instanceof Error ? error.message : 'UNKNOWN';

  switch (message) {
    case 'AUTH_ERROR':
      return t('errors.auth');
    case 'TIMEOUT':
      return t('errors.timeout');
    case 'RATE_LIMIT':
      return t('errors.rateLimit');
    default:
      return t('errors.unknown');
  }
}

const initialPipelineProgress: PipelineProgress = {
  isRunning: false,
  currentStage: null,
  currentIteration: 0,
  progress: 0,
  currentModel: null,
  stagesCompleted: [],
  evaluation: null,
};

export function useChatState(options: UseChatStateOptions = {}): UseChatStateReturn {
  const { autoBackupInterval = 300000, usePipeline = true } = options;

  const { t } = useTranslation();

  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pipeline state
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress>(initialPipelineProgress);

  // History for undo/redo
  const [history, setHistory] = useState<Message[][]>([]);
  const [redoStack, setRedoStack] = useState<Message[][]>([]);

  // Abort controller for cancellation
  const abortRef = useRef<AbortController | null>(null);
  const pipelineCancelledRef = useRef(false);

  // Load backup on mount
  useEffect(() => {
    let isMounted = true;

    loadLatestBackup()
      .then((stored) => {
        if (stored && isMounted) {
          setMessages(stored);
        }
      })
      .catch((err) => console.warn('Backup restore failed:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-backup messages periodically
  useEffect(() => {
    if (autoBackupInterval <= 0) return;

    const interval = setInterval(() => {
      saveBackup(messages).catch((err) => console.warn('Backup failed:', err));
    }, autoBackupInterval);

    return () => clearInterval(interval);
  }, [messages, autoBackupInterval]);

  // Clear chat and save to history
  const clearChat = useCallback(() => {
    if (messages.length === 0) return;

    setHistory((prev) => [...prev, messages]);
    setRedoStack([]);
    setMessages([]);
    setError(null);
  }, [messages]);

  // Undo - restore previous state
  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;

    setHistory((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, messages]);
    setMessages(previous);
  }, [history, messages]);

  // Redo - restore next state
  const redo = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;

    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, messages]);
    setMessages(next);
  }, [redoStack, messages]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cancel ongoing request
  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pipelineCancelledRef.current = true;
    setIsLoading(false);
    setIsResearching(false);
    setPipelineProgress(initialPipelineProgress);
  }, []);

  // Send a message using pipeline or direct API
  const sendMessage = useCallback(
    async (prompt: string, model?: string) => {
      if (isLoading) return;

      // Cancel any previous request
      abortRef.current?.abort();
      pipelineCancelledRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;

      // Create user message
      const userMessage: Message = {
        id: generateMessageId(),
        role: 'user',
        content: prompt.trim(),
        timestamp: new Date(),
      };

      // Update state
      setMessages((prev) => [...prev, userMessage]);
      setRedoStack([]); // Clear redo stack on new message
      setIsLoading(true);
      setIsResearching(true);
      setError(null);
      setPipelineProgress(initialPipelineProgress);

      try {
        let responseContent: string;
        let modelUsed: string | undefined;

        if (usePipeline && !model) {
          // Use AI Pipeline with feedback loop
          setPipelineProgress(prev => ({ ...prev, isRunning: true }));

          const pipelineResult = await executePipeline(prompt, {
            onStageStart: (stage, iteration) => {
              if (pipelineCancelledRef.current) return;
              setPipelineProgress(prev => ({
                ...prev,
                currentStage: stage,
                currentIteration: iteration,
                progress: calculatePipelineProgress(stage, iteration),
              }));
            },

            onStageComplete: (stage) => {
              if (pipelineCancelledRef.current) return;
              setPipelineProgress(prev => ({
                ...prev,
                stagesCompleted: [...prev.stagesCompleted, stage],
              }));
            },

            onIterationComplete: (_, evaluation) => {
              if (pipelineCancelledRef.current) return;
              setPipelineProgress(prev => ({
                ...prev,
                evaluation,
              }));
            },

            onModelChange: (aiModel: AIModel) => {
              if (pipelineCancelledRef.current) return;
              setPipelineProgress(prev => ({
                ...prev,
                currentModel: `${aiModel.provider}/${aiModel.id}`,
              }));
            },
          });

          if (pipelineCancelledRef.current) return;

          responseContent = pipelineResult.response;
          modelUsed = `pipeline (${pipelineResult.totalIterations} iterations)`;

          // Update final pipeline state
          setPipelineProgress(prev => ({
            ...prev,
            isRunning: false,
            progress: 100,
            evaluation: pipelineResult.context.finalEvaluation,
          }));

          setIsResearching(false);
        } else {
          // Use direct API call (legacy mode or specific model requested)
          await new Promise((resolve) => setTimeout(resolve, 300));
          setIsResearching(false);

          const response = await executePrompt(prompt, model, controller.signal);
          responseContent = response.response;
          modelUsed = response.model_used;
        }

        // Create assistant message
        const assistantMessage: Message = {
          id: generateMessageId(),
          role: 'assistant',
          content: responseContent,
          modelUsed,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        // Don't show error if request was aborted
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (pipelineCancelledRef.current) {
          return;
        }

        const errorMessage = mapErrorMessage(err, t);
        setError(errorMessage);
        setPipelineProgress(initialPipelineProgress);
      } finally {
        setIsLoading(false);
        setIsResearching(false);
      }
    },
    [isLoading, t, usePipeline]
  );

  // Helper to calculate pipeline progress percentage
  function calculatePipelineProgress(stage: PipelineStage, iteration: number): number {
    const stagesOrder: PipelineStage[] = ['ROUTE', 'SPECULATE', 'PLAN', 'EXECUTE', 'SYNTHESIZE', 'EVALUATE'];
    const stageIndex = stagesOrder.indexOf(stage);
    const stagesPerIteration = stagesOrder.length;
    const maxIterations = 3;
    const totalStages = stagesPerIteration * maxIterations;
    const completedStages = (iteration - 1) * stagesPerIteration + stageIndex;
    return Math.round((completedStages / totalStages) * 100);
  }

  return {
    // State
    messages,
    isLoading,
    isResearching,
    error,

    // Pipeline state
    pipelineProgress,

    // Computed
    canUndo: history.length > 0,
    canRedo: redoStack.length > 0,
    isEmpty: messages.length === 0,

    // Actions
    sendMessage,
    clearChat,
    undo,
    redo,
    clearError,
    cancelRequest,
  };
}

export default useChatState;
