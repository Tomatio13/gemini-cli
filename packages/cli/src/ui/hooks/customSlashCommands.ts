/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { SlashCommand, CommandContext, SlashCommandActionReturn, CommandKind } from '../commands/types.js';
import { Config } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

export interface CustomSlashCommandMetadata {
  'allowed-tools'?: string[];
  description?: string;
}

export interface CustomSlashCommandFile {
  name: string;
  path: string;
  namespace?: string;
  metadata: CustomSlashCommandMetadata;
  content: string;
}

export interface CustomSlashCommandContext {
  addMessage: (message: any) => void; // Simplified to avoid complex Message type conflicts
  config?: Config;
  onDebugMessage: (message: string) => void;
}

/**
 * Parses YAML frontmatter from markdown content
 */
function parseYamlFrontmatter(content: string): { metadata: CustomSlashCommandMetadata; content: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { metadata: {}, content };
  }

  const yamlContent = match[1];
  const markdownContent = match[2];
  
  try {
    // Simple YAML parser for basic key-value pairs
    const metadata: CustomSlashCommandMetadata = {};
    const lines = yamlContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex === -1) continue;
      
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      
      if (key === 'allowed-tools') {
        // Parse array-like values
        const arrayMatch = value.match(/^\[(.*)\]$/);
        if (arrayMatch) {
          metadata['allowed-tools'] = arrayMatch[1]
            .split(',')
            .map(item => item.trim().replace(/^['"]|['"]$/g, ''));
        }
      } else if (key === 'description') {
        metadata.description = value.replace(/^['"]|['"]$/g, '');
      }
    }
    
    return { metadata, content: markdownContent };
  } catch (error) {
    return { metadata: {}, content };
  }
}

/**
 * Executes bash commands prefixed with '!' in the content
 */
async function executeBashCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Processes dynamic content in markdown (bash commands and file references)
 */
async function processDynamicContent(
  content: string,
  context: CustomSlashCommandContext,
  args?: string
): Promise<string> {
  let processedContent = content;

  // Replace $ARGUMENTS placeholder
  if (args) {
    processedContent = processedContent.replace(/\$ARGUMENTS/g, args);
  }

  // Process bash commands (lines starting with !`)
  const bashCommandRegex = /!\`([^`]+)\`/g;
  let match;
  while ((match = bashCommandRegex.exec(processedContent)) !== null) {
    const command = match[1];
    try {
      const output = await executeBashCommand(command);
      processedContent = processedContent.replace(match[0], output);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.onDebugMessage(`Failed to execute bash command '${command}': ${errorMessage}`);
      processedContent = processedContent.replace(match[0], `[Command failed: ${errorMessage}]`);
    }
  }

  // Process file references (@ prefixed paths)
  const fileRefRegex = /@([^\s]+)/g;
  let fileMatch;
  while ((fileMatch = fileRefRegex.exec(processedContent)) !== null) {
    const filePath = fileMatch[1];
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      processedContent = processedContent.replace(fileMatch[0], `\n\`\`\`\n${fileContent}\n\`\`\`\n`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.onDebugMessage(`Failed to read file '${filePath}': ${errorMessage}`);
      processedContent = processedContent.replace(fileMatch[0], `[File not found: ${filePath}]`);
    }
  }

  return processedContent;
}

/**
 * Discovers custom slash command files in the ~/.gemini/commands directory
 */
export async function discoverCustomSlashCommands(): Promise<CustomSlashCommandFile[]> {
  const commands: CustomSlashCommandFile[] = [];
  const commandsDir = path.join(os.homedir(), '.gemini', 'commands');

  try {
    await fs.access(commandsDir);
  } catch {
    // Directory doesn't exist, return empty array
    return commands;
  }

  async function scanDirectory(dir: string, namespace?: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories for namespaced commands
          const subNamespace = namespace ? `${namespace}:${entry.name}` : entry.name;
          await scanDirectory(fullPath, subNamespace);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const commandName = entry.name.replace('.md', '');
          const content = await fs.readFile(fullPath, 'utf-8');
          const { metadata, content: markdownContent } = parseYamlFrontmatter(content);
          
          commands.push({
            name: commandName,
            path: fullPath,
            namespace,
            metadata,
            content: markdownContent,
          });
        }
      }
    } catch (error) {
      // Ignore errors in subdirectories
    }
  }

  await scanDirectory(commandsDir);
  return commands;
}

/**
 * Creates SlashCommand objects from custom command files
 */
export function createCustomSlashCommands(
  customCommands: CustomSlashCommandFile[],
  context: CustomSlashCommandContext
): SlashCommand[] {
  return customCommands.map(command => {
    const commandName = command.namespace ? `user:${command.namespace}:${command.name}` : `user:${command.name}`;
    
    return {
      name: commandName,
      description: command.metadata.description || `Custom command: ${command.name}`,
      kind: CommandKind.FILE,
      action: async (commandContext: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
        try {
          const processedContent = await processDynamicContent(command.content, context, args);
          
          // Add the processed content as a user message to trigger LLM conversation
          context.addMessage({
            type: 'user',
            content: processedContent,
            timestamp: new Date(),
          });
          
          // Return message action to indicate the content should be sent to LLM
          return {
            type: 'message',
            messageType: 'info',
            content: processedContent,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          context.addMessage({
            type: 'error',
            content: `Failed to execute custom command '${commandName}': ${errorMessage}`,
            timestamp: new Date(),
          });
          
          // Return error message
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to execute custom command '${commandName}': ${errorMessage}`,
          };
        }
      },
    };
  });
} 