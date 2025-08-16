/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HookExecutor } from './hookExecutor.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('HookExecutor Integration Tests', () => {
  let tempDir: string;
  let tempFile: string;
  let hookExecutor: HookExecutor;

  beforeEach(() => {
    tempDir = tmpdir();
    tempFile = join(tempDir, `hook-test-${Date.now()}.txt`);
    
    // Clean up any existing test file
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  });

  describe('PreToolUse hooks', () => {
    it('should execute command hook and write to file', async () => {
      const hookSettings = {
        PreToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                type: 'command' as const,
                command: `echo "PreToolUse executed" > "${tempFile}"`,
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.log',
        tool_name: 'write_file',
        tool_input: { filename: 'test.txt', content: 'Hello World' },
      };

      const result = await hookExecutor.executeHooks('PreToolUse', hookInput);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(existsSync(tempFile)).toBe(true);
      
      // Check file content
      const content = require('fs').readFileSync(tempFile, 'utf-8').trim();
      expect(content).toBe('PreToolUse executed');
    });

    it('should pass JSON input to hook via stdin', async () => {
      const hookSettings = {
        PreToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                type: 'command' as const,
                command: `cat > "${tempFile}"`,
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session-123',
        transcript_path: '/tmp/test.log',
        tool_name: 'write_file',
        tool_input: { filename: 'test.txt', content: 'Hello World' },
      };

      const result = await hookExecutor.executeHooks('PreToolUse', hookInput);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(existsSync(tempFile)).toBe(true);
      
      // Check that JSON was written to file
      const content = require('fs').readFileSync(tempFile, 'utf-8');
      const parsedContent = JSON.parse(content);
      expect(parsedContent.session_id).toBe('test-session-123');
      expect(parsedContent.tool_name).toBe('write_file');
    });
  });

  describe('PostToolUse hooks', () => {
    it('should execute command hook with tool response', async () => {
      const hookSettings = {
        PostToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                type: 'command' as const,
                command: `cat > "${tempFile}"`,
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.log',
        tool_name: 'write_file',
        tool_input: { filename: 'test.txt', content: 'Hello World' },
        tool_response: 'File written successfully',
      };

      const result = await hookExecutor.executeHooks('PostToolUse', hookInput);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(existsSync(tempFile)).toBe(true);
      
      // Check that tool response was included
      const content = require('fs').readFileSync(tempFile, 'utf-8');
      const parsedContent = JSON.parse(content);
      expect(parsedContent.tool_response).toBe('File written successfully');
    });
  });

  describe('Notification hooks', () => {
    it('should execute notification hook', async () => {
      const hookSettings = {
        Notification: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command' as const,
                command: `cat > "${tempFile}"`,
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.log',
        notification_type: 'info',
        message: 'Test notification message',
        timestamp: '2025-01-27T10:00:00.000Z',
      };

      const result = await hookExecutor.executeHooks('Notification', hookInput);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(existsSync(tempFile)).toBe(true);
      
      // Check notification data
      const content = require('fs').readFileSync(tempFile, 'utf-8');
      const parsedContent = JSON.parse(content);
      expect(parsedContent.notification_type).toBe('info');
      expect(parsedContent.message).toBe('Test notification message');
    });
  });

  describe('Multiple hooks execution', () => {
    it('should execute multiple hooks in sequence', async () => {
      const tempFile2 = join(tempDir, `hook-test-2-${Date.now()}.txt`);
      
      const hookSettings = {
        PreToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                type: 'command' as const,
                command: `echo "Hook 1" > "${tempFile}"`,
              },
              {
                type: 'command' as const,
                command: `echo "Hook 2" > "${tempFile2}"`,
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.log',
        tool_name: 'write_file',
        tool_input: { filename: 'test.txt', content: 'Hello World' },
      };

      const result = await hookExecutor.executeHooks('PreToolUse', hookInput);

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(true);
      
      // Check both files were created
      expect(existsSync(tempFile)).toBe(true);
      expect(existsSync(tempFile2)).toBe(true);
      
      const content1 = require('fs').readFileSync(tempFile, 'utf-8').trim();
      const content2 = require('fs').readFileSync(tempFile2, 'utf-8').trim();
      expect(content1).toBe('Hook 1');
      expect(content2).toBe('Hook 2');
      
      // Clean up second file
      if (existsSync(tempFile2)) {
        unlinkSync(tempFile2);
      }
    });
  });

  describe('Error handling', () => {
    it('should handle command failure gracefully', async () => {
      const hookSettings = {
        PreToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                type: 'command' as const,
                command: 'exit 1', // Command that fails
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.log',
        tool_name: 'write_file',
        tool_input: { filename: 'test.txt', content: 'Hello World' },
      };

      const result = await hookExecutor.executeHooks('PreToolUse', hookInput);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toContain('exit code 1');
    });

    it('should handle invalid command gracefully', async () => {
      const hookSettings = {
        PreToolUse: [
          {
            matcher: 'write_file',
            hooks: [
              {
                type: 'command' as const,
                command: 'nonexistent-command-12345',
              },
            ],
          },
        ],
      };

      hookExecutor = new HookExecutor(hookSettings, false);

      const hookInput = {
        session_id: 'test-session',
        transcript_path: '/tmp/test.log',
        tool_name: 'write_file',
        tool_input: { filename: 'test.txt', content: 'Hello World' },
      };

      const result = await hookExecutor.executeHooks('PreToolUse', hookInput);

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(false);
      expect(result[0].error).toBeTruthy();
    });
  });
}); 