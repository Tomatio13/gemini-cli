/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';

import { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI_COMPATIBLE = 'openai-compatible',
  USE_ANTHROPIC = 'anthropic',
  USE_LOCAL_LLM = 'local-llm',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
  // New fields for custom endpoints
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
};

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;

  // New environment variables for other providers
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const localLlmApiKey = process.env.LOCAL_LLM_API_KEY;
  const customBaseUrl = process.env.CUSTOM_BASE_URL;
  const customTimeout = process.env.CUSTOM_TIMEOUT;

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
    baseUrl: customBaseUrl,
    timeout: customTimeout ? parseInt(customTimeout, 10) : undefined,
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    return contentGeneratorConfig;
  }

  // Vertex AI
  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    return contentGeneratorConfig;
  }

  // OpenAI Compatible API (includes OpenAI, local LLMs with OpenAI-compatible endpoints)
  if (authType === AuthType.USE_OPENAI_COMPATIBLE) {
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for openai-compatible auth type.');
    }
    contentGeneratorConfig.apiKey = openaiApiKey;
    contentGeneratorConfig.baseUrl = customBaseUrl || 'https://api.openai.com/v1';
    // Use OpenAI model names instead of Gemini model names
    if (effectiveModel.includes('gemini')) {
      contentGeneratorConfig.model = 'gpt-4o'; // Default to GPT-4o for Gemini models
    } else {
      contentGeneratorConfig.model = effectiveModel; // Use the specified model if it's not a Gemini model
    }
    return contentGeneratorConfig;
  }

  // Anthropic API
  if (authType === AuthType.USE_ANTHROPIC) {
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for anthropic auth type.');
    }
    contentGeneratorConfig.apiKey = anthropicApiKey;
    contentGeneratorConfig.baseUrl = customBaseUrl || 'https://api.anthropic.com';
    // Use Anthropic model names instead of Gemini model names
    if (effectiveModel.includes('gemini')) {
      contentGeneratorConfig.model = 'claude-3-5-sonnet-20241022'; // Default to Claude for Gemini models
    } else {
      contentGeneratorConfig.model = effectiveModel; // Use the specified model if it's not a Gemini model
    }
    return contentGeneratorConfig;
  }

  // Local LLM (typically OpenAI-compatible)
  if (authType === AuthType.USE_LOCAL_LLM) {
    contentGeneratorConfig.apiKey = localLlmApiKey || 'dummy-key';
    contentGeneratorConfig.baseUrl = customBaseUrl || 'http://localhost:8000/v1';
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  // Google Gemini API and Vertex AI
  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }

  // OpenAI Compatible APIs (including OpenAI, local LLMs with OpenAI-compatible endpoints)
  if (config.authType === AuthType.USE_OPENAI_COMPATIBLE) {
    const { OpenAICompatibleContentGenerator } = await import('./customContentGenerators.js');
    
    console.log(`🔍 OpenAI Compatible mode, model: ${config.model}, includes gemini: ${config.model.includes('gemini')}, starts with gpt-5: ${config.model.startsWith('gpt-5')}`);
    
    // LiteLLM経由でGeminiまたはGPT-5系モデルを呼び出す場合は専用のContentGeneratorを使用
    if (config.model.includes('gemini') || config.model.startsWith('gpt-5')) {
      const { LiteLLMGeminiContentGenerator } = await import('./litellmGeminiContentGenerator.js');
      console.log(`🔍 Using LiteLLMGeminiContentGenerator for model: ${config.model}`);
      return new LiteLLMGeminiContentGenerator(config);
    }
    console.log(`🔍 Using OpenAICompatibleContentGenerator for model: ${config.model}`);
    return new OpenAICompatibleContentGenerator(config);
  }

  // Anthropic API
  if (config.authType === AuthType.USE_ANTHROPIC) {
    const { AnthropicContentGenerator } = await import('./customContentGenerators.js');
    return new AnthropicContentGenerator(config);
  }

  // Local LLM (typically OpenAI-compatible)
  if (config.authType === AuthType.USE_LOCAL_LLM) {
    const { OpenAICompatibleContentGenerator } = await import('./customContentGenerators.js');
    return new OpenAICompatibleContentGenerator(config);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
