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
 * and remains idle for a sufficient duration to indicate true completion
 * (i.e., when AI responses truly complete and not just between tool executions)
 */
export const useIdleStopHook = (
  streamingState: StreamingState,
  config: Config | null,
) => {
  const prevStreamingStateRef = useRef<StreamingState>(StreamingState.Idle);
  const isExecutingRef = useRef<boolean>(false);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log(`[DEBUG] useIdleStopHook: streamingState changed to ${streamingState}, prev was ${prevStreamingStateRef.current}`);
    
    // Clear any existing timeout when streaming state changes
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }

    const executeStopHook = async () => {
      if (!config) return;
      
      const hooks = config.getHooks();
      console.log('[DEBUG] Hooks configuration:', hooks);
      console.log('[DEBUG] Stop hooks:', hooks?.Stop);
      
      if (hooks && hooks.Stop) {
        isExecutingRef.current = true;
        
        try {
          const { HookExecutor, sessionId } = await import('@google/gemini-cli-core');
          const hookExecutor = new HookExecutor(hooks, config.getDebugMode());
          
          const hookInput = {
            session_id: sessionId,
            transcript_path: (await config.getTranscriptPath()) || '',
            stop_reason: 'response_complete',
            session_duration: '', // Not applicable for response completion
            timestamp: new Date().toISOString(),
          };

          if (config.getDebugMode()) {
            console.log(`[DEBUG] Executing Stop hook after stable IDLE state`);
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
    };

    // Only proceed if we transitioned from Responding to Idle
    if (
      prevStreamingStateRef.current === StreamingState.Responding &&
      streamingState === StreamingState.Idle &&
      !isExecutingRef.current &&
      config
    ) {
      // Set a timeout to ensure the Idle state is stable
      // This prevents Stop hooks from firing during brief transitions between tool executions
      idleTimeoutRef.current = setTimeout(() => {
        // Double-check that we're still in Idle state after the timeout
        if (streamingState === StreamingState.Idle && !isExecutingRef.current) {
          executeStopHook();
        }
      }, 1000); // Wait 1 second to ensure stable idle state
    }

    prevStreamingStateRef.current = streamingState;

    // Cleanup timeout on unmount
    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };
  }, [streamingState, config]);
}; 