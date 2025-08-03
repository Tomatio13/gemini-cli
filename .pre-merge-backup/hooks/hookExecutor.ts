/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';

export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
}

export interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

export interface HookSettings {
  PreToolUse?: HookMatcher[];
  PostToolUse?: HookMatcher[];
  Notification?: HookMatcher[];
  Stop?: HookMatcher[];
  SubagentStop?: HookMatcher[];
}

export interface HookInput {
  session_id: string;
  transcript_path: string;
  tool_name?: string;
  [key: string]: any;
}

export interface HookDecision {
  decision?: 'approve' | 'block' | undefined;
  reason?: string;
}

export interface HookExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  decision?: HookDecision;
}

export interface HookExecutionOptions {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export class HookExecutor {
  private readonly DEFAULT_TIMEOUT = 60000; // 60 seconds

  constructor(
    private readonly hookSettings: HookSettings,
    private readonly debugMode: boolean = false
  ) {}

  /**
   * Executes hooks for a specific event
   */
  async executeHooks(
    eventName: keyof HookSettings,
    input: HookInput,
    options: HookExecutionOptions = {}
  ): Promise<HookExecutionResult[]> {
    const matchers = this.hookSettings[eventName];
    if (!matchers || matchers.length === 0) {
      return [];
    }

    const results: HookExecutionResult[] = [];
    const matchingHooks = this.getMatchingHooks(matchers, input);

    if (matchingHooks.length === 0) {
      return results;
    }

    if (this.debugMode) {
      console.log(`[DEBUG] Executing hooks for ${eventName}`);
      console.log(`[DEBUG] Found ${matchingHooks.length} matching hooks`);
    }

    // Execute all matching hooks in parallel
    const hookPromises = matchingHooks.map(hook => 
      this.executeHook(hook, input, options)
    );

    const hookResults = await Promise.allSettled(hookPromises);

    for (let i = 0; i < hookResults.length; i++) {
      const result = hookResults[i];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          success: false,
          error: result.reason?.message || 'Hook execution failed',
        });
      }
    }

    return results;
  }

  /**
   * Finds hooks that match the current input
   */
  private getMatchingHooks(
    matchers: HookMatcher[],
    input: HookInput
  ): HookCommand[] {
    const matchingHooks: HookCommand[] = [];

    for (const matcher of matchers) {
      if (this.matchesPattern(matcher.matcher, input)) {
        matchingHooks.push(...matcher.hooks);
      }
    }

    return matchingHooks;
  }

  /**
   * Checks if the input matches the pattern
   */
  private matchesPattern(pattern: string | undefined, input: HookInput): boolean {
    if (!pattern) {
      return true; // Empty pattern matches all
    }

    // For tool events, check against tool_name
    if (input.tool_name) {
      try {
        // Support regex patterns
        const regex = new RegExp(pattern, 'i');
        return regex.test(input.tool_name);
      } catch (e) {
        // If regex fails, do exact match
        return input.tool_name === pattern;
      }
    }

    return true;
  }

  /**
   * Executes a single hook command
   */
  private async executeHook(
    hook: HookCommand,
    input: HookInput,
    options: HookExecutionOptions
  ): Promise<HookExecutionResult> {
    const timeout = hook.timeout || options.timeout || this.DEFAULT_TIMEOUT;
    const cwd = options.cwd || process.cwd();

    if (this.debugMode) {
      console.log(`[DEBUG] Executing hook command: ${hook.command}`);
    }

    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', hook.command], {
        cwd,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Send input as JSON to stdin
      if (child.stdin) {
        // Handle stdin errors gracefully
        child.stdin.on('error', (error) => {
          // Ignore EPIPE errors - process may have already exited
          if (this.debugMode && (error as any).code !== 'EPIPE') {
            console.error('Error writing to stdin:', error);
          }
        });

        try {
          child.stdin.write(JSON.stringify(input));
          child.stdin.end();
        } catch (error) {
          // Ignore EPIPE errors - process may have already exited
          if (this.debugMode && (error as any).code !== 'EPIPE') {
            console.error('Error writing to stdin:', error);
          }
        }
      }

      // Collect output
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);

        if (timedOut) {
          resolve({
            success: false,
            error: `Hook command timed out after ${timeout}ms`,
          });
          return;
        }

        if (this.debugMode) {
          console.log(`[DEBUG] Hook command completed with status ${code}`);
          if (stdout) {
            console.log(`[DEBUG] Hook stdout: ${stdout}`);
          }
          if (stderr) {
            console.log(`[DEBUG] Hook stderr: ${stderr}`);
          }
        }

        // Handle different exit codes
        if (code === 0) {
          // Success - parse any JSON output for decision
          let decision: HookDecision | undefined;
          try {
            if (stdout.trim()) {
              const parsed = JSON.parse(stdout.trim());
              if (parsed.decision || parsed.reason) {
                decision = parsed;
              }
            }
          } catch (e) {
            // Not JSON, that's fine
          }

          resolve({
            success: true,
            output: stdout,
            decision,
          });
        } else if (code === 2) {
          // Blocking error - stderr is fed back to Claude
          resolve({
            success: false,
            error: stderr || 'Hook blocked execution',
            decision: { decision: 'block', reason: stderr },
          });
        } else {
          // Other error
          resolve({
            success: false,
            error: stderr || `Hook failed with exit code ${code}`,
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  }

  /**
   * Checks if any hook result blocks the operation
   */
  static shouldBlock(results: HookExecutionResult[]): { block: boolean; reason?: string } {
    for (const result of results) {
      if (result.decision?.decision === 'block') {
        return { block: true, reason: result.decision.reason };
      }
      if (!result.success && result.error) {
        return { block: true, reason: result.error };
      }
    }
    return { block: false };
  }
} 