/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  discoverCustomSlashCommands,
  createCustomSlashCommands,
  CustomSlashCommandContext,
} from './customSlashCommands.js';

// Mock fs module
vi.mock('fs', () => ({
  default: {},
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock os module
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/test'),
  },
}));

describe('customSlashCommands', () => {
  const mockContext: CustomSlashCommandContext = {
    addMessage: vi.fn(),
    onDebugMessage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverCustomSlashCommands', () => {
    it('should return empty array if commands directory does not exist', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.access.mockRejectedValue(new Error('Directory not found'));

      const result = await discoverCustomSlashCommands();
      expect(result).toEqual([]);
    });

    it.skip('should discover markdown files in commands directory', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        { name: 'test-command.md', isFile: () => true, isDirectory: () => false },
        { name: 'other-file.txt', isFile: () => true, isDirectory: () => false },
      ] as any);
      mockFs.readFile.mockResolvedValue('# Test Command\n\nThis is a test command.');

      const result = await discoverCustomSlashCommands();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'test-command',
        path: path.join('/home/test', '.gemini', 'commands', 'test-command.md'),
        namespace: undefined,
        metadata: {},
        content: '# Test Command\n\nThis is a test command.',
      });
    });

    it.skip('should handle YAML frontmatter', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        { name: 'command-with-meta.md', isFile: () => true, isDirectory: () => false },
      ] as any);
      mockFs.readFile.mockResolvedValue(`---
description: "A test command with metadata"
allowed-tools: ["git", "npm"]
---

# Test Command

This is a test command with metadata.`);

      const result = await discoverCustomSlashCommands();
      expect(result).toHaveLength(1);
      expect(result[0].metadata).toEqual({
        description: 'A test command with metadata',
        'allowed-tools': ['git', 'npm'],
      });
      expect(result[0].content).toBe('\n# Test Command\n\nThis is a test command with metadata.');
    });

    it.skip('should discover commands in subdirectories with namespaces', async () => {
      const mockFs = vi.mocked(fs);
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir
        .mockResolvedValueOnce([
          { name: 'git', isFile: () => false, isDirectory: () => true },
        ] as any)
        .mockResolvedValueOnce([
          { name: 'commit.md', isFile: () => true, isDirectory: () => false },
        ] as any);
      mockFs.readFile.mockResolvedValue('# Git Commit\n\nCommit helper command.');

      const result = await discoverCustomSlashCommands();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'commit',
        path: path.join('/home/test', '.gemini', 'commands', 'git', 'commit.md'),
        namespace: 'git',
        metadata: {},
        content: '# Git Commit\n\nCommit helper command.',
      });
    });
  });

  describe('createCustomSlashCommands', () => {
    it('should create slash commands from custom command files', () => {
      const customCommands = [
        {
          name: 'test-command',
          path: '/path/to/test-command.md',
          metadata: { description: 'Test command' },
          content: 'This is a test command.',
        },
      ];

      const result = createCustomSlashCommands(customCommands, mockContext);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('user:test-command');
      expect(result[0].description).toBe('Test command');
    });

    it('should handle namespaced commands', () => {
      const customCommands = [
        {
          name: 'commit',
          path: '/path/to/git/commit.md',
          namespace: 'git',
          metadata: { description: 'Git commit helper' },
          content: 'Git commit command.',
        },
      ];

      const result = createCustomSlashCommands(customCommands, mockContext);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('user:git:commit');
      expect(result[0].description).toBe('Git commit helper');
    });

    it('should execute command action and add message', async () => {
      const customCommands = [
        {
          name: 'test-command',
          path: '/path/to/test-command.md',
          metadata: {},
          content: 'Hello, world!',
        },
      ];

      const result = createCustomSlashCommands(customCommands, mockContext);
      await result[0].action('user:test-command');

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        type: 'user',
        content: 'Hello, world!',
        timestamp: expect.any(Date),
      });
    });

    it('should handle argument substitution', async () => {
      const customCommands = [
        {
          name: 'greet',
          path: '/path/to/greet.md',
          metadata: {},
          content: 'Hello, $ARGUMENTS!',
        },
      ];

      const result = createCustomSlashCommands(customCommands, mockContext);
      await result[0].action('user:greet', undefined, 'John');

      expect(mockContext.addMessage).toHaveBeenCalledWith({
        type: 'user',
        content: 'Hello, John!',
        timestamp: expect.any(Date),
      });
    });
  });
}); 