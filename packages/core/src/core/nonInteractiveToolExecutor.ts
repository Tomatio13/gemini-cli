/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  logToolCall,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolRegistry,
  ToolResult,
  sessionId,
} from '../index.js';
import { Config } from '../config/config.js';
import { convertToFunctionResponse } from './coreToolScheduler.js';
import { HookExecutor } from '../hooks/hookExecutor.js';

/**
 * Executes a single tool call non-interactively.
 * It does not handle confirmations, multiple calls, or live updates.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<ToolCallResponseInfo> {
  const tool = toolRegistry.getTool(toolCallRequest.name);

  const startTime = Date.now();
  
  // Create HookExecutor if hooks are configured
  let hookExecutor;
  const hooks = config.getHooks();
  if (hooks && Object.keys(hooks).length > 0) {
    hookExecutor = new HookExecutor(hooks, config.getDebugMode());
  }

  if (!tool) {
    const error = new Error(
      `Tool "${toolCallRequest.name}" not found in registry.`,
    );
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
    });
    // Ensure the response structure matches what the API expects for an error
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }

  try {
    // Execute PreToolUse hooks
    if (hookExecutor) {
      try {
        await hookExecutor.executeHooks('PreToolUse', {
          session_id: sessionId,
          transcript_path: await config.getTranscriptPath(),
          tool_name: toolCallRequest.name,
          call_id: toolCallRequest.callId,
          args: toolCallRequest.args,
        });
      } catch (error) {
        console.warn('PreToolUse hook execution failed:', error);
      }
    }

    // Directly execute without confirmation or live output handling
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const toolResult: ToolResult = await tool.execute(
      toolCallRequest.args,
      effectiveAbortSignal,
      // No live output callback for non-interactive mode
    );

    const tool_output = toolResult.llmContent;

    const tool_display = toolResult.returnDisplay;

    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: true,
      prompt_id: toolCallRequest.prompt_id,
    });

    // Execute PostToolUse hooks
    if (hookExecutor) {
      try {
        await hookExecutor.executeHooks('PostToolUse', {
          session_id: sessionId,
          transcript_path: await config.getTranscriptPath(),
          tool_name: toolCallRequest.name,
          call_id: toolCallRequest.callId,
          args: toolCallRequest.args,
          result: tool_output,
        });
      } catch (error) {
        console.warn('PostToolUse hook execution failed:', error);
      }
    }

    const response = convertToFunctionResponse(
      toolCallRequest.name,
      toolCallRequest.callId,
      tool_output,
    );

    return {
      callId: toolCallRequest.callId,
      responseParts: response,
      resultDisplay: tool_display,
      error: undefined,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
    });

    // Execute PostToolUse hooks even on error
    if (hookExecutor) {
      try {
        await hookExecutor.executeHooks('PostToolUse', {
          session_id: sessionId,
          transcript_path: await config.getTranscriptPath(),
          tool_name: toolCallRequest.name,
          call_id: toolCallRequest.callId,
          args: toolCallRequest.args,
          error: error.message,
        });
      } catch (hookError) {
        console.warn('PostToolUse hook execution failed:', hookError);
      }
    }

    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }
}
