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
  Content,
  Part,
  Candidate,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import { ContentGenerator, ContentGeneratorConfig } from './contentGenerator.js';

/**
 * LiteLLM経由でGemini APIを呼び出す専用ContentGenerator
 * Gemini特有のツール（Google Search, Code Execution, MCP）を保持
 */
export class LiteLLMGeminiContentGenerator implements ContentGenerator {
  constructor(private config: ContentGeneratorConfig) {
    console.log(`🔍 LiteLLMGeminiContentGenerator initialized with model: ${config.model}`);
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const litellmRequest = this.convertToLiteLLMGeminiFormat(request);
    
    console.log('🔍 LiteLLM Gemini Request:', JSON.stringify({
      model: litellmRequest.model,
      toolsCount: litellmRequest.tools?.length || 0,
      tools: litellmRequest.tools
    }, null, 2));
    
    const url = `${this.config.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify(litellmRequest),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text();
      }
      throw new Error(`LiteLLM Gemini Error HTTP ${response.status}: ${response.statusText}. Details: ${errorDetails}`);
    }

    const data = await response.json();
    console.log('✅ LiteLLM Gemini Response:', JSON.stringify({
      choices: data.choices?.length || 0,
      toolCalls: data.choices?.[0]?.message?.tool_calls?.length || 0,
      usage: data.usage
    }, null, 2));

    const result = this.convertFromLiteLLMFormat(data);
    if (!result) {
      throw new Error('Failed to convert LiteLLM Gemini response');
    }
    return result;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.generateContentStreamInternal(request);
  }

  private async *generateContentStreamInternal(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const litellmRequest = { ...this.convertToLiteLLMGeminiFormat(request), stream: true };
    
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.customHeaders,
      },
      body: JSON.stringify(litellmRequest),
      signal: this.config.timeout ? AbortSignal.timeout(this.config.timeout) : undefined,
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text();
      }
      throw new Error(`LiteLLM Gemini Stream Error HTTP ${response.status}: ${response.statusText}. Details: ${errorDetails}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Track accumulated tool call arguments for streaming
    const toolCallAccumulator = new Map<string, {
      id: string;
      name: string;
      arguments: string;
    }>();

    // Track mapping from index to actual call ID for streaming
    const indexToIdMap = new Map<number, string>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // Process any accumulated tool calls at the end
              if (toolCallAccumulator.size > 0) {
                const completedToolCalls = Array.from(toolCallAccumulator.values());
                const geminiResponse = this.convertAccumulatedToolCallsToGemini(completedToolCalls);
                if (geminiResponse) {
                  yield geminiResponse;
                }
              }
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const geminiResponse = this.convertFromLiteLLMFormat(parsed, true, toolCallAccumulator, indexToIdMap);
              if (geminiResponse) {
                yield geminiResponse;
              }
            } catch (e) {
              // Skip invalid JSON - this is expected for some streaming events
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // 概算実装 - LiteLLMはtoken countingを直接サポートしていない
    const contents = this.normalizeContents(request.contents);
    const text = this.extractTextFromContents(contents);
    const approximateTokens = Math.ceil(text.length / 4); // 4文字≈1トークンの概算

    return {
      totalTokens: approximateTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Embeddings not supported via LiteLLM Gemini');
  }

  private convertToLiteLLMGeminiFormat(request: GenerateContentParameters): any {
    const contents = this.normalizeContents(request.contents);
    const messages = this.convertMessages(contents);
    
    // モデル名の正規化
    let modelName = this.config.model;
    
    // GPT-5系モデルの場合は gemini/ プレフィックスを付けない
    const isGpt5Model = modelName.startsWith('gpt-5');
    if (!isGpt5Model && !modelName.startsWith('gemini/')) {
      modelName = `gemini/${modelName}`;
    }
    
    const litellmRequest: any = {
      model: modelName,
      messages,
      stream: false,
    };
    
    // GPT-5系モデルでは特別なパラメータ処理
    if (isGpt5Model) {
      // GPT-5モデルはtemperatureのデフォルト値（1）のみをサポート
      // temperatureパラメータを省略してデフォルト値を使用
      litellmRequest.max_completion_tokens = request.config?.maxOutputTokens || 2048;
      console.log(`🔍 GPT-5 model detected: ${modelName}, using max_completion_tokens: ${litellmRequest.max_completion_tokens}, temperature: default (1)`);
    } else {
      // 通常のモデルでは通常のパラメータを使用
      litellmRequest.temperature = request.config?.temperature || 0.7;
      litellmRequest.top_p = request.config?.topP || 1;
      litellmRequest.max_tokens = request.config?.maxOutputTokens || 2048;
    }

    // 🔑 重要: Gemini特有ツールを保持したまま送信
    if (request.config?.tools && request.config.tools.length > 0) {
      litellmRequest.tools = this.preserveGeminiToolsForLiteLLM(request.config.tools);
    }

    return litellmRequest;
  }

  private preserveGeminiToolsForLiteLLM(tools: any[]): any[] {
    console.log('🔍 Original tools received:', JSON.stringify(tools, null, 2));
    
    const preservedTools = [];
    
    for (const tool of tools) {
      // ✅ Gemini特有ツールをそのまま保持
      if ('googleSearch' in tool) {
        preservedTools.push({ googleSearch: tool.googleSearch });
        console.log('✅ Preserved Google Search tool');
        continue;
      }
      
      if ('codeExecution' in tool) {
        preservedTools.push({ codeExecution: tool.codeExecution });
        console.log('✅ Preserved Code Execution tool');
        continue;
      }
      
      if ('urlContext' in tool) {
        preservedTools.push({ urlContext: tool.urlContext });
        console.log('✅ Preserved URL Context tool');
        continue;
      }
      
      // 🔑 重要: Gemini標準の関数宣言をOpenAI形式に変換
      if ('functionDeclarations' in tool && tool.functionDeclarations) {
        console.log('🔄 Converting Gemini functionDeclarations to OpenAI format');
        
        for (const funcDecl of tool.functionDeclarations) {
          const openaiTool = {
            type: "function",
            function: {
              name: funcDecl.name,
              description: funcDecl.description,
              parameters: funcDecl.parametersJsonSchema
            }
          };
          preservedTools.push(openaiTool);
          console.log(`✅ Converted function: ${funcDecl.name}`);
        }
        continue;
      }
      
      console.log('⚠️ Unknown tool type:', Object.keys(tool));
    }
    
    console.log('✅ Final preserved tools for LiteLLM (OpenAI format):', JSON.stringify(preservedTools, null, 2));
    return preservedTools;
  }

  private normalizeContents(contents: any): Content[] {
    if (!Array.isArray(contents)) {
      return [];
    }

    return contents.map((content: any) => {
      // 文字列の場合は、userロールのメッセージとして扱う
      if (typeof content === 'string') {
        return {
          role: 'user',
          parts: [{ text: content }]
        };
      }

      // 正しい形式のContentオブジェクトの場合
      if (content && typeof content === 'object' && content.role && content.parts) {
        return content;
      }

      // その他の場合は、JSON文字列として扱う
      return {
        role: 'user',
        parts: [{ text: JSON.stringify(content) }]
      };
    }).filter(content => content.role && content.parts); // 有効なコンテンツのみを返す
  }

  private convertMessages(contents: Content[]): any[] {
    return contents.map((content: Content) => {
      const message = {
        role: content.role === 'model' ? 'assistant' : content.role,
        content: content.parts?.map((part: Part) => {
          if ('text' in part) {
            return part.text;
          }
          // Handle other part types as needed
          return JSON.stringify(part);
        }).join('\n') || '',
      };
      
      return message;
    });
  }

  private convertFromLiteLLMFormat(
    data: any,
    isStream = false,
    toolCallAccumulator?: Map<string, { id: string; name: string; arguments: string }>,
    indexToIdMap?: Map<number, string>
  ): GenerateContentResponse | null {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No choices in LiteLLM response');
    }

    const text = isStream
      ? choice.delta?.content || ''
      : choice.message?.content || '';

    // Parse function calls - support both Gemini and OpenAI formats
    const functionCalls: any[] = [];
    const message = isStream ? choice.delta : choice.message;

    // Handle OpenAI-style tool_calls (fallback for mixed responses)
    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {

        if ((toolCall.type === 'function' || isStream) && toolCall.function) {
          if (isStream && toolCallAccumulator) {
            // Handle streaming tool calls - accumulate arguments
            const index = toolCall.index || 0;

            // If this chunk has an ID, store the mapping
            if (toolCall.id && indexToIdMap) {
              indexToIdMap.set(index, toolCall.id);
            }

            // Get the actual call ID from the mapping or use the current ID
            const callId = (indexToIdMap && indexToIdMap.get(index)) || toolCall.id || `call_${index}`;

            if (!toolCallAccumulator.has(callId)) {
              toolCallAccumulator.set(callId, {
                id: callId,
                name: toolCall.function.name || '',
                arguments: ''
              });
            }

            const accumulated = toolCallAccumulator.get(callId)!;
            if (toolCall.function.name) {
              accumulated.name = toolCall.function.name;
            }
            if (toolCall.function.arguments) {
              accumulated.arguments += toolCall.function.arguments;
            }

            // Don't yield function calls during streaming - wait for completion
            continue;
          } else {
            // Handle non-streaming tool calls
            try {
              const args = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments || {};

              functionCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                args: args,
              });
              
              console.log(`✅ Converted OpenAI-style tool call: ${toolCall.function.name}`, args);
            } catch (e) {
              // Failed to parse tool call arguments - this can happen with malformed JSON
              console.log(`⚠️ Failed to parse tool call arguments for ${toolCall.function.name}:`, e);
              functionCalls.push({
                id: toolCall.id,
                name: toolCall.function.name,
                args: {},
              });
            }
          }
        }
      }
    }

    // Handle Gemini-style function calls (primary format when using Gemini tools)
    if (message?.function_call) {
      try {
        const args = typeof message.function_call.arguments === 'string'
          ? JSON.parse(message.function_call.arguments)
          : message.function_call.arguments || {};

        functionCalls.push({
          id: `gemini_${Date.now()}`,
          name: message.function_call.name,
          args: args,
        });
        
        console.log(`✅ Converted Gemini-style function call: ${message.function_call.name}`, args);
      } catch (e) {
        console.log(`⚠️ Failed to parse Gemini function call arguments for ${message.function_call.name}:`, e);
        functionCalls.push({
          id: `gemini_${Date.now()}`,
          name: message.function_call.name,
          args: {},
        });
      }
    }

    // For streaming, only return response if there's text content
    if (isStream && !text && functionCalls.length === 0) {
      return null;
    }

    const candidate: Candidate = {
      content: {
        parts: [{ text }],
        role: 'model',
      },
      finishReason: choice.finish_reason || 'STOP',
      index: 0,
    };

    const usageMetadata: GenerateContentResponseUsageMetadata = {
      promptTokenCount: data.usage?.prompt_tokens || 0,
      candidatesTokenCount: data.usage?.completion_tokens || 0,
      totalTokenCount: data.usage?.total_tokens || 0,
    };

    return {
      candidates: [candidate],
      usageMetadata,
      text: text,
      data: undefined,
      functionCalls: functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  private convertAccumulatedToolCallsToGemini(
    toolCalls: Array<{ id: string; name: string; arguments: string }>
  ): GenerateContentResponse | null {
    const functionCalls: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        const args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
        functionCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          args: args,
        });
      } catch (e) {
        // Failed to parse accumulated tool call arguments - this can happen with malformed JSON
        functionCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          args: {},
        });
      }
    }

    if (functionCalls.length === 0) {
      return null;
    }

    const candidate: Candidate = {
      content: {
        parts: [{ text: '' }],
        role: 'model',
      },
      finishReason: 'tool_calls' as any,
      index: 0,
    };

    const usageMetadata: GenerateContentResponseUsageMetadata = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    return {
      candidates: [candidate],
      usageMetadata,
      text: '',
      data: undefined,
      functionCalls: functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  private extractTextFromContents(contents: Content[]): string {
    return contents
      .map(content =>
        content.parts
          ?.map((part: Part) => ('text' in part ? part.text : ''))
          .join(' ') || ''
      )
      .join(' ');
  }
}