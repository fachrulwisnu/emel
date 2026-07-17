import OpenAI from 'openai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ModelConfig {
  name: string;
  id: string;
  apiKey: string | undefined;
}

const MODELS: ModelConfig[] = [
  {
    name: 'GLM-5.2',
    id: 'z-ai/glm-5.2',
    apiKey: process.env.NVIDIA_API_KEY_GLM || process.env.NVIDIA_API_KEY || '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'
  },
  {
    name: 'Nemotron',
    id: 'nvidia/nemotron-340b-instruct',
    apiKey: process.env.NVIDIA_API_KEY_NEMOTRON || process.env.NVIDIA_API_KEY || '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'
  },
  {
    name: 'Gemma',
    id: 'google/gemma-2-27b-it',
    apiKey: process.env.NVIDIA_API_KEY_GEMMA || process.env.NVIDIA_API_KEY || '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'
  }
];

/**
 * Executes a completion across NVIDIA models with Auto-Model Rotation.
 * If one model fails, it automatically continues to the next model in rotation.
 * 
 * Supports both a raw string prompt or structured OpenAI messages array.
 */
export async function getAiCompletion(prompt: string | any[]): Promise<string> {
  const messages = typeof prompt === 'string'
    ? [{ role: 'user', content: prompt }]
    : prompt;

  let lastError: Error | null = null;

  for (const model of MODELS) {
    try {
      console.log(`[AI Rotator] Attempting generation with model: ${model.name} (${model.id})`);
      if (!model.apiKey) {
        throw new Error(`API Key for model ${model.name} is not configured.`);
      }

      const openai = new OpenAI({
        apiKey: model.apiKey,
        baseURL: 'https://integrate.api.nvidia.com/v1',
        timeout: 60000,
      });

      const completion = await openai.chat.completions.create({
        model: model.id,
        messages: messages,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 4096,
        stream: false
      });

      const rawContent = completion.choices[0]?.message?.content || '';
      if (!rawContent) {
        throw new Error(`Empty response from model: ${model.name}`);
      }

      console.log(`[AI Rotator] Success with model: ${model.name}`);
      return rawContent;
    } catch (err: any) {
      console.warn(`[AI Rotator] Error with model ${model.name}:`, err.message || String(err));
      lastError = err;
      continue; // Auto-rotate to next model
    }
  }

  throw new Error(`All rotated AI models failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Robust fallback completion implementation specifically requested by the user.
 */
export async function getAiCompletionWithFallback(prompt: string | any[]): Promise<string> {
  return getAiCompletion(prompt);
}
