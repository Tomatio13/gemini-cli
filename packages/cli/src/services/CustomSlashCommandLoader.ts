/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';
import { ICommandLoader } from './types.js';
import { 
  discoverCustomSlashCommands, 
  createCustomSlashCommands,
  type CustomSlashCommandContext 
} from '../ui/hooks/customSlashCommands.js';

/**
 * Loads custom slash commands from the user's ~/.gemini/commands directory.
 * Implements the ICommandLoader interface to work with the new CommandService.
 */
export class CustomSlashCommandLoader implements ICommandLoader {
  constructor(private readonly context: CustomSlashCommandContext) {}

  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    try {
      const customCommandFiles = await discoverCustomSlashCommands();
      console.debug(`[CustomSlashCommandLoader] Found ${customCommandFiles.length} custom command files:`, customCommandFiles.map(f => f.name));
      const customCommands = createCustomSlashCommands(customCommandFiles, this.context);
      console.debug(`[CustomSlashCommandLoader] Created ${customCommands.length} custom commands:`, customCommands.map(c => c.name));
      return customCommands;
    } catch (error) {
      console.debug('Failed to load custom slash commands:', error);
      return [];
    }
  }
}