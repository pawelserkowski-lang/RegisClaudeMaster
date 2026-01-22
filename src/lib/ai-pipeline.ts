/**
 * AI Pipeline with Feedback Loop
 *
 * Pipeline stages:
 * 1. ROUTE     → Web AI (Gemini Thinking) - analyze task + learnings
 * 2. SPECULATE → Ollama (context gathering)
 * 3. PLAN      → Auto (Ollama/Gemini) - create execution plan
 * 4. EXECUTE   → Ollama - execute the plan
 * 5. SYNTHESIZE → Web AI (Gemini Thinking) - synthesize results
 * 6. EVALUATE  → Web AI (Gemini Thinking) - evaluate quality
 *
 * Feedback loop: If qualityScore < 7, add learnings and retry (max 3x)
 */

import type { AIModel, AIProviderSettings } from './ai-providers';
import { executeWithFallback, fetchAllModels, getBestModel, getFallbackChain } from './ai-providers';
import { getProviderSettings } from './ai-providers-store';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PipelineStage = 'ROUTE' | 'SPECULATE' | 'PLAN' | 'EXECUTE' | 'SYNTHESIZE' | 'EVALUATE';

export interface Learning {
  iteration: number;
  suggestions: string[];
  qualityScore: number;
  timestamp: Date;
}

export interface EvaluationResult {
  qualityScore: number;  // 1-10
  completeness: number;  // 1-10
  accuracy: number;      // 1-10
  clarity: number;       // 1-10
  usefulness: number;    // 1-10
  suggestions: string[];
  shouldRetry: boolean;
}

export interface PipelineContext {
  // Input
  originalPrompt: string;

  // State
  currentStage: PipelineStage;
  iteration: number;
  maxIterations: number;

  // Accumulated data
  routeAnalysis: string | null;
  speculativeContext: string | null;
  executionPlan: string | null;
  executionResult: string | null;
  synthesizedResult: string | null;

  // Feedback loop
  learnings: Learning[];
  finalEvaluation: EvaluationResult | null;

  // Metadata
  startTime: Date;
  stageTimings: Record<PipelineStage, number>;
  modelsUsed: Record<PipelineStage, string>;
  errors: Array<{ stage: PipelineStage; error: string }>;
}

export interface PipelineResult {
  success: boolean;
  response: string;
  context: PipelineContext;
  totalIterations: number;
  totalTime: number;
}

export interface StageResult {
  output: string;
  model: string;
  duration: number;
}

// ============================================================================
// Stage Prompts
// ============================================================================

const PROMPTS = {
  ROUTE: (prompt: string, learnings: Learning[]) => {
    const learningsContext = learnings.length > 0
      ? `\n\nPrevious iterations feedback:\n${learnings.map(l =>
          `- Iteration ${l.iteration} (score: ${l.qualityScore}/10): ${l.suggestions.join('; ')}`
        ).join('\n')}`
      : '';

    return `You are an AI task router. Analyze this task and determine the best approach.

TASK: ${prompt}
${learningsContext}

Analyze:
1. Task complexity (simple/medium/complex)
2. Required knowledge domains
3. Whether external context is needed
4. Recommended execution strategy

Output a structured analysis in JSON format:
{
  "complexity": "simple|medium|complex",
  "domains": ["list", "of", "domains"],
  "needsContext": true|false,
  "strategy": "description of recommended approach",
  "keyPoints": ["important", "considerations"]
}`;
  },

  SPECULATE: (prompt: string, routeAnalysis: string) => `You are a context specialist. Gather relevant context for this task.

TASK: ${prompt}

ROUTE ANALYSIS: ${routeAnalysis}

Generate speculative context:
1. What background knowledge is needed?
2. What are the key concepts involved?
3. What potential challenges might arise?
4. What assumptions should be validated?

Provide comprehensive context that will help execute this task effectively.`,

  PLAN: (prompt: string, context: string, routeAnalysis: string) => `You are a planning specialist. Create an execution plan for this task.

TASK: ${prompt}

ROUTE ANALYSIS: ${routeAnalysis}

GATHERED CONTEXT: ${context}

Create a detailed execution plan:
1. Break down the task into clear steps
2. Identify dependencies between steps
3. Note any potential blockers
4. Define success criteria

Output format:
## Execution Plan

### Step 1: [Title]
- Action: [what to do]
- Expected output: [what we expect]

### Step 2: ...

### Success Criteria
- [criterion 1]
- [criterion 2]`,

  EXECUTE: (prompt: string, plan: string, context: string) => `You are an execution specialist. Execute the following plan.

ORIGINAL TASK: ${prompt}

CONTEXT: ${context}

EXECUTION PLAN:
${plan}

Execute each step of the plan carefully. Provide detailed output for each step.
If you encounter any issues, note them and adapt your approach.

Begin execution:`,

  SYNTHESIZE: (prompt: string, executionResult: string, context: PipelineContext) => `You are a synthesis specialist. Create a cohesive final response.

ORIGINAL TASK: ${prompt}

EXECUTION RESULT:
${executionResult}

CONTEXT GATHERED: ${context.speculativeContext || 'None'}

ITERATION: ${context.iteration}/${context.maxIterations}

${context.learnings.length > 0 ? `PREVIOUS FEEDBACK:\n${context.learnings.map(l =>
  `- Score ${l.qualityScore}/10: ${l.suggestions.join('; ')}`
).join('\n')}` : ''}

Synthesize a clear, comprehensive response that:
1. Directly addresses the original task
2. Incorporates all relevant information from the execution
3. Is well-structured and easy to understand
4. Addresses any previous feedback

Provide the final response:`,

  EVALUATE: (prompt: string, synthesizedResult: string, context: PipelineContext) => `You are a quality evaluator. Evaluate this response critically.

ORIGINAL TASK: ${prompt}

SYNTHESIZED RESPONSE:
${synthesizedResult}

ITERATION: ${context.iteration}/${context.maxIterations}

Evaluate on these criteria (1-10 scale):
1. **Completeness**: Does it fully address all aspects of the task?
2. **Accuracy**: Is the information correct and reliable?
3. **Clarity**: Is it well-organized and easy to understand?
4. **Usefulness**: Does it provide practical value to the user?

Output ONLY valid JSON:
{
  "qualityScore": <1-10 overall score>,
  "completeness": <1-10>,
  "accuracy": <1-10>,
  "clarity": <1-10>,
  "usefulness": <1-10>,
  "suggestions": ["specific improvement 1", "specific improvement 2"],
  "shouldRetry": <true if qualityScore < 7 and improvements possible>
}`
};

// ============================================================================
// Model Selection
// ============================================================================

type ModelPreference = 'web' | 'ollama' | 'auto';

const STAGE_MODEL_PREFERENCE: Record<PipelineStage, ModelPreference> = {
  ROUTE: 'web',
  SPECULATE: 'ollama',
  PLAN: 'auto',
  EXECUTE: 'ollama',
  SYNTHESIZE: 'web',
  EVALUATE: 'web',
};

function selectModelForStage(
  stage: PipelineStage,
  models: AIModel[]
): AIModel | null {
  const preference = STAGE_MODEL_PREFERENCE[stage];

  if (preference === 'web') {
    // Prefer Gemini > Anthropic > OpenAI for web stages
    const gemini = models.find(m => m.provider === 'gemini' && m.available);
    const anthropic = models.find(m => m.provider === 'anthropic' && m.available);
    const openai = models.find(m => m.provider === 'openai' && m.available);
    return gemini || anthropic || openai || getBestModel(models);
  }

  if (preference === 'ollama') {
    // Prefer Ollama for local stages
    const ollama = models.find(m => m.provider === 'ollama' && m.available);
    if (ollama) return ollama;
    // Fallback to any available model
    return getBestModel(models);
  }

  // Auto: use best available (already sorted by score)
  return getBestModel(models);
}

// ============================================================================
// Stage Executors
// ============================================================================

async function executeStage(
  stage: PipelineStage,
  prompt: string,
  models: AIModel[],
  settings: AIProviderSettings,
  onModelChange?: (model: AIModel) => void
): Promise<StageResult> {
  const startTime = Date.now();
  const preferredModel = selectModelForStage(stage, models);

  if (!preferredModel) {
    throw new Error(`No model available for stage ${stage}`);
  }

  // Create a fallback chain starting with preferred model
  const chain = [preferredModel, ...getFallbackChain(models).filter(m => m.id !== preferredModel.id)];

  const { response, model } = await executeWithFallback(prompt, chain, settings, onModelChange);

  return {
    output: response,
    model: `${model.provider}/${model.id}`,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Main Pipeline
// ============================================================================

export interface PipelineCallbacks {
  onStageStart?: (stage: PipelineStage, iteration: number) => void;
  onStageComplete?: (stage: PipelineStage, result: StageResult) => void;
  onIterationComplete?: (iteration: number, evaluation: EvaluationResult) => void;
  onModelChange?: (model: AIModel) => void;
}

export async function executePipeline(
  prompt: string,
  callbacks?: PipelineCallbacks
): Promise<PipelineResult> {
  const settings = getProviderSettings();
  const models = await fetchAllModels(settings);

  if (models.length === 0) {
    throw new Error('No AI models available');
  }

  const context: PipelineContext = {
    originalPrompt: prompt,
    currentStage: 'ROUTE',
    iteration: 1,
    maxIterations: 3,
    routeAnalysis: null,
    speculativeContext: null,
    executionPlan: null,
    executionResult: null,
    synthesizedResult: null,
    learnings: [],
    finalEvaluation: null,
    startTime: new Date(),
    stageTimings: {} as Record<PipelineStage, number>,
    modelsUsed: {} as Record<PipelineStage, string>,
    errors: [],
  };

  const startTime = Date.now();

  while (context.iteration <= context.maxIterations) {
    try {
      // Stage 1: ROUTE
      context.currentStage = 'ROUTE';
      callbacks?.onStageStart?.('ROUTE', context.iteration);

      const routeResult = await executeStage(
        'ROUTE',
        PROMPTS.ROUTE(prompt, context.learnings),
        models,
        settings,
        callbacks?.onModelChange
      );
      context.routeAnalysis = routeResult.output;
      context.stageTimings.ROUTE = routeResult.duration;
      context.modelsUsed.ROUTE = routeResult.model;
      callbacks?.onStageComplete?.('ROUTE', routeResult);

      // Stage 2: SPECULATE
      context.currentStage = 'SPECULATE';
      callbacks?.onStageStart?.('SPECULATE', context.iteration);

      const speculateResult = await executeStage(
        'SPECULATE',
        PROMPTS.SPECULATE(prompt, context.routeAnalysis),
        models,
        settings,
        callbacks?.onModelChange
      );
      context.speculativeContext = speculateResult.output;
      context.stageTimings.SPECULATE = speculateResult.duration;
      context.modelsUsed.SPECULATE = speculateResult.model;
      callbacks?.onStageComplete?.('SPECULATE', speculateResult);

      // Stage 3: PLAN
      context.currentStage = 'PLAN';
      callbacks?.onStageStart?.('PLAN', context.iteration);

      const planResult = await executeStage(
        'PLAN',
        PROMPTS.PLAN(prompt, context.speculativeContext, context.routeAnalysis),
        models,
        settings,
        callbacks?.onModelChange
      );
      context.executionPlan = planResult.output;
      context.stageTimings.PLAN = planResult.duration;
      context.modelsUsed.PLAN = planResult.model;
      callbacks?.onStageComplete?.('PLAN', planResult);

      // Stage 4: EXECUTE
      context.currentStage = 'EXECUTE';
      callbacks?.onStageStart?.('EXECUTE', context.iteration);

      const executeResult = await executeStage(
        'EXECUTE',
        PROMPTS.EXECUTE(prompt, context.executionPlan, context.speculativeContext),
        models,
        settings,
        callbacks?.onModelChange
      );
      context.executionResult = executeResult.output;
      context.stageTimings.EXECUTE = executeResult.duration;
      context.modelsUsed.EXECUTE = executeResult.model;
      callbacks?.onStageComplete?.('EXECUTE', executeResult);

      // Stage 5: SYNTHESIZE
      context.currentStage = 'SYNTHESIZE';
      callbacks?.onStageStart?.('SYNTHESIZE', context.iteration);

      const synthesizeResult = await executeStage(
        'SYNTHESIZE',
        PROMPTS.SYNTHESIZE(prompt, context.executionResult, context),
        models,
        settings,
        callbacks?.onModelChange
      );
      context.synthesizedResult = synthesizeResult.output;
      context.stageTimings.SYNTHESIZE = synthesizeResult.duration;
      context.modelsUsed.SYNTHESIZE = synthesizeResult.model;
      callbacks?.onStageComplete?.('SYNTHESIZE', synthesizeResult);

      // Stage 6: EVALUATE
      context.currentStage = 'EVALUATE';
      callbacks?.onStageStart?.('EVALUATE', context.iteration);

      const evaluateResult = await executeStage(
        'EVALUATE',
        PROMPTS.EVALUATE(prompt, context.synthesizedResult, context),
        models,
        settings,
        callbacks?.onModelChange
      );
      context.stageTimings.EVALUATE = evaluateResult.duration;
      context.modelsUsed.EVALUATE = evaluateResult.model;
      callbacks?.onStageComplete?.('EVALUATE', evaluateResult);

      // Parse evaluation
      const evaluation = parseEvaluation(evaluateResult.output);
      context.finalEvaluation = evaluation;

      callbacks?.onIterationComplete?.(context.iteration, evaluation);

      // Check if we need to retry
      if (evaluation.qualityScore >= 7 || context.iteration >= context.maxIterations) {
        // Success or max iterations reached
        return {
          success: evaluation.qualityScore >= 7,
          response: context.synthesizedResult,
          context,
          totalIterations: context.iteration,
          totalTime: Date.now() - startTime,
        };
      }

      // Add learnings for next iteration
      context.learnings.push({
        iteration: context.iteration,
        suggestions: evaluation.suggestions,
        qualityScore: evaluation.qualityScore,
        timestamp: new Date(),
      });

      context.iteration++;

      logPipeline(`Iteration ${context.iteration - 1} scored ${evaluation.qualityScore}/10, retrying...`);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      context.errors.push({ stage: context.currentStage, error: message });

      logPipeline(`Error in ${context.currentStage}: ${message}`);

      // If critical error, return what we have
      if (context.synthesizedResult) {
        return {
          success: false,
          response: context.synthesizedResult,
          context,
          totalIterations: context.iteration,
          totalTime: Date.now() - startTime,
        };
      }

      throw error;
    }
  }

  // Should not reach here, but handle anyway
  return {
    success: false,
    response: context.synthesizedResult || 'Pipeline failed to produce a result',
    context,
    totalIterations: context.iteration,
    totalTime: Date.now() - startTime,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function parseEvaluation(output: string): EvaluationResult {
  try {
    // Extract JSON from response
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in evaluation output');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      qualityScore: Number(parsed.qualityScore) || 5,
      completeness: Number(parsed.completeness) || 5,
      accuracy: Number(parsed.accuracy) || 5,
      clarity: Number(parsed.clarity) || 5,
      usefulness: Number(parsed.usefulness) || 5,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      shouldRetry: Boolean(parsed.shouldRetry),
    };
  } catch {
    // Default evaluation if parsing fails
    return {
      qualityScore: 6,
      completeness: 6,
      accuracy: 6,
      clarity: 6,
      usefulness: 6,
      suggestions: ['Could not parse evaluation, assuming acceptable quality'],
      shouldRetry: false,
    };
  }
}

function logPipeline(message: string): void {
  if (import.meta.env?.DEV) {
    console.info(`[ai-pipeline] ${message}`);
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  selectModelForStage,
  STAGE_MODEL_PREFERENCE,
  PROMPTS,
};
