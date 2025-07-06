/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Config } from '@google/gemini-cli-core';
import { StreamingState } from '../types.js';

/**
 * Hook to execute Stop hooks when the streaming state becomes Idle
 * (i.e., when AI responses complete)
 */
export const useIdleStopHook = (
  streamingState: StreamingState,
  config: Config | null,
) => {
  const prevStreamingStateRef = useRef<StreamingState>(StreamingState.Idle);
  const isExecutingRef = useRef<boolean>(false);

  useEffect(() => {
    const executeStopHook = async () => {
      if (
        prevStreamingStateRef.current === StreamingState.Responding &&
        streamingState === StreamingState.Idle &&
        !isExecutingRef.current &&
        config
      ) {
        const hooks = config.getHooks();
        if (hooks && hooks.Stop) {
          isExecutingRef.current = true;
          
          try {
            const { HookExecutor, sessionId } = await import('@google/gemini-cli-core');
            const hookExecutor = new HookExecutor(hooks, config.getDebugMode());
            
            const hookInput = {
              session_id: sessionId,
              transcript_path: await config.getTranscriptPath(),
              stop_reason: 'response_complete',
              session_duration: '', // Not applicable for response completion
              timestamp: new Date().toISOString(),
            };

            if (config.getDebugMode()) {
              console.log(`[DEBUG] Executing Stop hook on IDLE state transition`);
            }

            // Execute Stop hook asynchronously without blocking
            hookExecutor.executeHooks('Stop', hookInput).catch((error) => {
              if (config.getDebugMode()) {
                console.warn(`[DEBUG] Stop hook execution failed:`, error);
              }
            });
          } catch (error) {
            if (config.getDebugMode()) {
              console.warn(`[DEBUG] Failed to initialize Stop hook:`, error);
            }
          } finally {
            isExecutingRef.current = false;
          }
        }
      }
    };

    executeStopHook();
    prevStreamingStateRef.current = streamingState;
  }, [streamingState, config]);
}; 