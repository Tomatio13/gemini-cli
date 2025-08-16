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
      const customCommands = createCustomSlashCommands(customCommandFiles, this.context);
      return customCommands;
    } catch (error) {
      console.error('Failed to load custom slash commands:', error);
      return [];
    }
  }
}