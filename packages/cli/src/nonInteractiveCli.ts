/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  GeminiEventType,
  sessionId,
} from '@google/gemini-cli-core';
import { Content, Part, FunctionCall } from '@google/genai';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';
import { CommandService } from './services/CommandService.js';
import { BuiltinCommandLoader } from './services/BuiltinCommandLoader.js';
import { FileCommandLoader } from './services/FileCommandLoader.js';
import { McpPromptLoader } from './services/McpPromptLoader.js';
import { CustomSlashCommandLoader } from './services/CustomSlashCommandLoader.js';
import { MessageType } from './ui/types.js';

/**
 * Handles slash commands in non-interactive mode
 */
async function handleSlashCommandNonInteractive(
  config: Config,
  command: string,
  prompt_id: string,
): Promise<void> {
  // Create command loaders
  const customSlashCommandContext = {
    addMessage: (message: any) => {
      // In non-interactive mode, we can output messages directly
      if (message.type === MessageType.ERROR) {
        console.error(message.text);
      } else {
        console.log(message.text);
      }
    },
  };

  const loaders = [
    new McpPromptLoader(config),
    new BuiltinCommandLoader(config),
    new FileCommandLoader(config),
    new CustomSlashCommandLoader(customSlashCommandContext),
  ];

  const abortController = new AbortController();
  const commandService = await CommandService.create(loaders, abortController.signal);
  const commands = commandService.getCommands();

  // Parse the command
  const parts = command.substring(1).trim().split(/\s+/);
  const commandPath = parts.filter((p) => p);

  let currentCommands = commands;
  let commandToExecute: any = undefined;
  let pathIndex = 0;
  const canonicalPath: string[] = [];

  for (const part of commandPath) {
    const foundCommand = currentCommands.find(
      (cmd: any) => cmd.name === part || cmd.altName === part,
    );

    if (foundCommand) {
      commandToExecute = foundCommand;
      pathIndex++;
      canonicalPath.push(foundCommand.name);
      if (foundCommand.subCommands) {
        currentCommands = foundCommand.subCommands;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  if (commandToExecute) {
    const args = parts.slice(pathIndex).join(' ');

    if (commandToExecute.action) {
      // Create a minimal command context for non-interactive mode
      const commandContext = {
        config,
        services: {
          settings: {
            setValue: () => {}, // Stub implementation
          },
        },
        session: {
          sessionShellAllowlist: new Set<string>(),
        },
        invocation: {
          raw: command,
          name: commandToExecute.name,
          args,
        },
      };

      try {
        const result = await commandToExecute.action(commandContext, args);

        
        if (result) {
          switch (result.type) {
            case 'submit_prompt': {
              // If the command generates a prompt, process it as a regular prompt
              const newInput = result.content;
              if (typeof newInput === 'string') {
                // Output the content and then process it as a prompt to the AI
                console.log("=== Generated Prompt ===");
                console.log(newInput);
                console.log("=== AI Response ===");
                await runNonInteractive(config, newInput, prompt_id);
              }
              break;
            }
            case 'handled': {
              // Command was handled, nothing more to do
              break;
            }
            case 'schedule_tool': {
              console.error('Tool scheduling is not supported in non-interactive mode');
              break;
            }
            case 'message': {
              // Handle message type result from custom commands
              if (result.content) {
                // Output the content directly
                console.log(result.content);
              } else if (result.messages) {
                for (const message of result.messages) {
                  if (message.type === MessageType.ERROR) {
                    console.error(message.text);
                  } else {
                    console.log(message.text);
                  }
                }
              }
              break;
            }
            default: {
              console.error(`Unsupported command result type: ${(result as any).type}`);
              break;
            }
          }
        }
      } catch (error) {
        console.error(`Error executing command ${commandToExecute.name}:`, error);
        process.exit(1);
      }
    } else {
      console.error(`Command ${commandToExecute.name} has no action`);
      process.exit(1);
    }
  } else {
    console.error(`${command}は、有効なコマンドとして認識されませんでした。利用可能なコマンドのリストは、\`/help\`と入力することで確認できます。`);
    process.exit(1);
  }
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  await config.initialize();
  
  // Check if input starts with a slash (slash command)
  const trimmedInput = input.trim();
  if (trimmedInput.startsWith('/')) {
    // Handle slash command in non-interactive mode
    try {
      await handleSlashCommandNonInteractive(config, trimmedInput, prompt_id);
      return;
    } catch (error) {
      console.error('Error executing slash command:', error);
      process.exit(1);
    }
  }
  
  // Handle EPIPE errors when the output is piped to a command that closes early.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // Exit gracefully if the pipe is closed.
      process.exit(0);
    }
  });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  const abortController = new AbortController();
  let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];
  let turnCount = 0;
  try {
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() >= 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        console.error(
          '\n Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
        return;
      }
      const functionCalls: FunctionCall[] = [];

      const responseStream = geminiClient.sendMessageStream(
        currentMessages[0]?.parts || [],
        abortController.signal,
        prompt_id,
      );

      for await (const event of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }

        if (event.type === GeminiEventType.Content) {
          process.stdout.write(event.value);
        } else if (event.type === GeminiEventType.ToolCallRequest) {
          const toolCallRequest = event.value;
          const fc: FunctionCall = {
            name: toolCallRequest.name,
            args: toolCallRequest.args,
            id: toolCallRequest.callId,
          };
          functionCalls.push(fc);
        }
      }

      if (functionCalls.length > 0) {
        const toolResponseParts: Part[] = [];

        for (const fc of functionCalls) {
          const callId = fc.id ?? `${fc.name}-${Date.now()}`;
          const requestInfo: ToolCallRequestInfo = {
            callId,
            name: fc.name as string,
            args: (fc.args ?? {}) as Record<string, unknown>,
            isClientInitiated: false,
            prompt_id,
          };

          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            toolRegistry,
            abortController.signal,
          );

          if (toolResponse.error) {
            const isToolNotFound = toolResponse.error.message.includes(
              'not found in registry',
            );
            console.error(
              `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
            if (!isToolNotFound) {
              process.exit(1);
            }
          }

          if (toolResponse.responseParts) {
            const parts = Array.isArray(toolResponse.responseParts)
              ? toolResponse.responseParts
              : [toolResponse.responseParts];
            for (const part of parts) {
              if (typeof part === 'string') {
                toolResponseParts.push({ text: part });
              } else if (part) {
                toolResponseParts.push(part);
              }
            }
          }
        }
        currentMessages = [{ role: 'user', parts: toolResponseParts }];

        // Execute Stop hooks after all tools in this turn are completed
        const hooks = config.getHooks();
        if (hooks && Object.keys(hooks).length > 0) {
          const { HookExecutor } = await import('@google/gemini-cli-core');
          const hookExecutor = new HookExecutor(hooks, config.getDebugMode());
          try {
            await hookExecutor.executeHooks('Stop', {
              session_id: sessionId,
              transcript_path: await config.getTranscriptPath(),
              completed_calls: functionCalls.length,
              successful_calls: functionCalls.length, // In non-interactive mode, we assume success if we reach here
              error_calls: 0,
            });
          } catch (error) {
            console.warn('Stop hook execution failed:', error);
          }
        }
      } else {
        process.stdout.write('\n'); // Ensure a final newline
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}
