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
  Content,
  Part,
  ContentListUnion,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

/**
 * Custom endpoint content generator for litellm/ollama compatibility
 */
class CustomEndpointContentGenerator implements ContentGenerator {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
    private model?: string,
  ) {}

  private convertContentToOpenAI(contents: any[], tools?: any[]): any[] {
    const messages = contents.map((content: any) => ({
      role: content.role === 'model' ? 'assistant' : content.role,
      content: (content.parts || []).map((part: any) => {
        if (part && typeof part === 'object' && 'text' in part) {
          return part.text;
        }
        if (part && typeof part === 'object' && 'functionCall' in part) {
          return `Function call: ${part.functionCall?.name}(${JSON.stringify(part.functionCall?.args)})`;
        }
        if (part && typeof part === 'object' && 'functionResponse' in part) {
          return `Function response: ${JSON.stringify(part.functionResponse?.response)}`;
        }
        // Handle other part types as needed
        return JSON.stringify(part);
      }).join('\n')
    }));

    return messages;
  }

  private convertToolsToOpenAI(tools?: any[]): any[] {
    if (!tools || tools.length === 0) {
      return [];
    }

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.functionDeclarations?.[0]?.name || 'unknown',
        description: tool.functionDeclarations?.[0]?.description || '',
        parameters: tool.functionDeclarations?.[0]?.parameters || {}
      }
    }));
  }

  private convertOpenAIToGemini(openAIResponse: any): any {
    const choice = openAIResponse.choices?.[0];
    if (!choice) {
      throw new Error('No choices in OpenAI response');
    }

    // Create a basic GenerateContentResponse structure
    const response: any = {
      candidates: [{
        content: {
          role: 'model',
          parts: []
        },
        finishReason: choice.finish_reason === 'stop' ? 'STOP' : 'OTHER',
        index: 0,
        safetyRatings: []
      }],
      promptFeedback: {
        safetyRatings: []
      }
    };

    const parts: any[] = [];

    // Handle text content
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // Handle function calls
    if (choice.message.tool_calls) {
      choice.message.tool_calls.forEach((toolCall: any) => {
        if (toolCall.type === 'function') {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || '{}')
            }
          });
        }
      });
    }

    response.candidates[0].content.parts = parts;

    // Add usage metadata if available
    if (openAIResponse.usage) {
      response.usageMetadata = {
        promptTokenCount: openAIResponse.usage.prompt_tokens,
        candidatesTokenCount: openAIResponse.usage.completion_tokens,
        totalTokenCount: openAIResponse.usage.total_tokens
      };
    }

    // Add required properties for GenerateContentResponse
    response.text = choice.message.content || '';
    response.functionCalls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    response.executableCode = [];
    response.codeExecutionResult = [];

    return response;
  }

  async generateContent(
    request: any,
  ): Promise<any> {
    // Handle ContentListUnion properly
    let contents: any[] = [];
    if (Array.isArray(request.contents)) {
      // Check if it's Content[] or PartUnion[]
      if (request.contents.length > 0 && typeof request.contents[0] === 'object' && 'role' in request.contents[0]) {
        contents = request.contents as any[];
      } else {
        // It's PartUnion[], convert to Content
        contents = [{
          role: 'user',
          parts: request.contents as any[]
        }];
      }
    } else if (typeof request.contents === 'string') {
      contents = [{
        role: 'user',
        parts: [{ text: request.contents }]
      }];
    } else {
      contents = [request.contents as any];
    }

    const tools = request.config?.tools;
    const messages = this.convertContentToOpenAI(contents, tools);
    
    const payload: any = {
      model: request.model || this.model,
      messages,
      temperature: request.config?.temperature || 0,
      max_tokens: request.config?.maxOutputTokens || 4096,
      stream: false,
    };

    // Add tools if available
    if (tools && tools.length > 0) {
      payload.tools = this.convertToolsToOpenAI(tools);
      payload.tool_choice = 'auto';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: request.config?.abortSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return this.convertOpenAIToGemini(data);
  }

  async generateContentStream(
    request: any,
  ): Promise<AsyncGenerator<any>> {
    const self = this;
    
    return (async function* () {
      // Handle ContentListUnion properly
      let contents: any[] = [];
      if (Array.isArray(request.contents)) {
        // Check if it's Content[] or PartUnion[]
        if (request.contents.length > 0 && typeof request.contents[0] === 'object' && 'role' in request.contents[0]) {
          contents = request.contents as any[];
        } else {
          // It's PartUnion[], convert to Content
          contents = [{
            role: 'user',
            parts: request.contents as any[]
          }];
        }
      } else if (typeof request.contents === 'string') {
        contents = [{
          role: 'user',
          parts: [{ text: request.contents }]
        }];
      } else {
        contents = [request.contents as any];
      }

      const tools = request.config?.tools;
      const messages = self.convertContentToOpenAI(contents, tools);
      
      const payload: any = {
        model: request.model || self.model,
        messages,
        temperature: request.config?.temperature || 0,
        max_tokens: request.config?.maxOutputTokens || 4096,
        stream: true,
      };

      // Add tools if available
      if (tools && tools.length > 0) {
        payload.tools = self.convertToolsToOpenAI(tools);
        payload.tool_choice = 'auto';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (self.apiKey) {
        headers['Authorization'] = `Bearer ${self.apiKey}`;
      }

      const response = await fetch(`${self.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: request.config?.abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedFunctionCall: any = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const data = trimmed.slice(6);
              if (data === '[DONE]') {
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0];
                if (choice) {
                  const parts: any[] = [];

                  // Handle text content
                  if (choice.delta?.content) {
                    parts.push({ text: choice.delta.content });
                  }

                  // Handle function calls
                  if (choice.delta?.tool_calls) {
                    choice.delta.tool_calls.forEach((toolCall: any) => {
                      if (toolCall.type === 'function') {
                        if (!accumulatedFunctionCall) {
                          accumulatedFunctionCall = {
                            name: toolCall.function.name || '',
                            arguments: toolCall.function.arguments || ''
                          };
                        } else {
                          accumulatedFunctionCall.name += toolCall.function.name || '';
                          accumulatedFunctionCall.arguments += toolCall.function.arguments || '';
                        }
                      }
                    });

                    // If function call is complete, add it to parts
                    if (choice.finish_reason === 'tool_calls' && accumulatedFunctionCall) {
                      parts.push({
                        functionCall: {
                          name: accumulatedFunctionCall.name,
                          args: JSON.parse(accumulatedFunctionCall.arguments || '{}')
                        }
                      });
                    }
                  }

                  if (parts.length > 0) {
                    const streamResponse: any = {
                      candidates: [{
                        content: {
                          role: 'model',
                          parts
                        },
                        finishReason: choice.finish_reason === 'stop' ? 'STOP' : 
                                     choice.finish_reason === 'tool_calls' ? 'STOP' : undefined,
                        index: 0,
                        safetyRatings: []
                      }],
                      promptFeedback: {
                        safetyRatings: []
                      },
                      text: choice.delta?.content || '',
                      functionCalls: parts.filter(p => p.functionCall).map(p => p.functionCall),
                      executableCode: [],
                      codeExecutionResult: []
                    };
                    yield streamResponse;
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    })();
  }

  async countTokens(request: any): Promise<any> {
    // Handle ContentListUnion properly
    let contents: any[] = [];
    if (Array.isArray(request.contents)) {
      contents = request.contents as any[];
    } else if (typeof request.contents === 'string') {
      contents = [{
        role: 'user',
        parts: [{ text: request.contents }]
      }];
    } else {
      contents = [request.contents as any];
    }

    // Approximate token count (OpenAI-style counting)
    const text = contents.map((content: any) => 
      (content.parts || []).map((part: any) => 
        part && typeof part === 'object' && 'text' in part ? part.text : JSON.stringify(part)
      ).join(' ')
    ).join(' ');
    
    // Rough estimation: ~4 chars per token
    const estimatedTokens = Math.ceil(text.length / 4);
    
    return {
      totalTokens: estimatedTokens
    };
  }

  async embedContent(
    request: any,
  ): Promise<any> {
    // Enhanced embeddings support for compatible endpoints
    if (!request.contents || (Array.isArray(request.contents) && request.contents.length === 0)) {
      return { embeddings: [] };
    }

    try {
      const texts = Array.isArray(request.contents) ? request.contents : [request.contents];
      const payload = {
        model: request.model || this.model || 'text-embedding-ada-002',
        input: texts,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Embeddings HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid embeddings response format');
      }

      return {
        embeddings: data.data.map((item: any) => ({
          values: item.embedding || []
        }))
      };
    } catch (error) {
      // Fallback for endpoints that don't support embeddings
      throw new Error(`Embeddings not supported for this endpoint: ${error}`);
    }
  }
}

export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_CUSTOM_ENDPOINT = 'custom-endpoint',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  baseUrl?: string;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { 
    getModel?: () => string;
    getCustomAuthType?: () => string | undefined;
    getCustomBaseUrl?: () => string | undefined;
    getCustomApiKey?: () => string | undefined;
  },
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;
  const customBaseUrl = process.env.CUSTOM_BASE_URL;
  const customApiKey = process.env.CUSTOM_API_KEY;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  //
  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    !!googleApiKey &&
    googleCloudProject &&
    googleCloudLocation
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  // Check for custom endpoint configuration
  if (authType === AuthType.USE_CUSTOM_ENDPOINT || config?.getCustomAuthType?.() === 'custom-endpoint') {
    const baseUrl = config?.getCustomBaseUrl?.() || customBaseUrl;
    const apiKey = config?.getCustomApiKey?.() || customApiKey;
    
    if (baseUrl) {
      contentGeneratorConfig.authType = AuthType.USE_CUSTOM_ENDPOINT;
      contentGeneratorConfig.baseUrl = baseUrl;
      contentGeneratorConfig.apiKey = apiKey;
      return contentGeneratorConfig;
    }
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_CUSTOM_ENDPOINT) {
    return new CustomEndpointContentGenerator(config.baseUrl!, config.apiKey, config.model);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
