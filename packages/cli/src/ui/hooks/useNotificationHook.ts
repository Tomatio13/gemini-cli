/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { Config, HookExecutor } from '@google/gemini-cli-core';
import { sessionId } from '@google/gemini-cli-core';

export const useNotificationHook = (config: Config) => {
  const executeNotificationHook = useCallback(
    async (notificationType: string, message: string, metadata?: Record<string, any>) => {
      const hooks = config.getHooks();
      if (!hooks || !hooks.Notification) {
        return;
      }

      const hookExecutor = new HookExecutor(hooks, config.getDebugMode());
      
      try {
        const hookInput = {
          session_id: sessionId,
          transcript_path: (await config.getTranscriptPath()) || '',
          notification_type: notificationType,
          message: message,
          timestamp: new Date().toISOString(),
          ...metadata,
        };

        const results = await hookExecutor.executeHooks('Notification', hookInput);
        
        if (config.getDebugMode()) {
          console.log(`[DEBUG] Notification hook results:`, results);
        }
      } catch (error) {
        if (config.getDebugMode()) {
          console.warn(`[DEBUG] Notification hook failed:`, error);
        }
      }
    },
    [config]
  );

  return executeNotificationHook;
}; 