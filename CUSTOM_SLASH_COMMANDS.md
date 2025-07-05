# Custom Slash Commands Implementation

This document describes the implementation of custom slash commands for gemini-cli, inspired by Anthropic Claude Code's slash commands.

## Overview

Custom slash commands allow users to create their own commands by placing Markdown files in the `~/.gemini/commands` directory. These commands can include:

- YAML frontmatter for metadata
- Dynamic content processing
- Argument substitution
- Bash command execution
- File references
- Namespace support through subdirectories

## Directory Structure

```
~/.gemini/commands/
├── test-command.md          # Basic command: /user:test-command
└── git/
    └── commit.md           # Namespaced command: /user:git:commit
```

## Command File Format

Custom command files are Markdown files with optional YAML frontmatter:

```markdown
---
description: "A simple test command for custom slash commands"
allowed-tools: ["shell"]
---

# Test Command

This is a test command. Arguments provided: $ARGUMENTS

Current directory: !`pwd`

## System Information

Operating System: !`uname -s`
Current User: !`whoami`
```

## Features

### 1. YAML Frontmatter
- `description`: Command description
- `allowed-tools`: Array of allowed tools

### 2. Dynamic Content Processing
- `$ARGUMENTS`: Replaced with command arguments
- `!`command``: Executes bash commands and replaces with output
- `@filepath`: Includes file content

### 3. Namespace Support
Commands in subdirectories get namespace prefixes:
- `commands/git/commit.md` → `/user:git:commit`

## Implementation Files

### Core Implementation
- `packages/cli/src/ui/hooks/customSlashCommands.ts` - Main implementation
- `packages/cli/src/ui/hooks/customSlashCommands.test.ts` - Test cases

### Integration
- `packages/cli/src/ui/hooks/slashCommandProcessor.ts` - Integration with existing slash command system

## Key Functions

### `discoverCustomSlashCommands()`
Scans the `~/.gemini/commands` directory for Markdown files and returns an array of `CustomSlashCommandFile` objects.

### `createCustomSlashCommands()`
Converts discovered command files into `SlashCommand` objects that can be used by the CLI.

### `parseYamlFrontmatter()`
Parses YAML frontmatter from Markdown files to extract metadata.

### `processDynamicContent()`
Processes dynamic content including argument substitution, bash command execution, and file references.

## Usage

1. Create a Markdown file in `~/.gemini/commands/`
2. Add YAML frontmatter (optional)
3. Write your command content with dynamic features
4. Use the command in CLI with `/user:command-name`

## Example Commands

### Basic Command
File: `~/.gemini/commands/hello.md`
```markdown
---
description: "Say hello to someone"
---

# Hello Command

Hello, $ARGUMENTS!
```

Usage: `/user:hello John` → "Hello, John!"

### Git Status Command
File: `~/.gemini/commands/git/status.md`
```markdown
---
description: "Show git status"
allowed-tools: ["shell"]
---

# Git Status

Current git status:
!`git status --porcelain`

Current branch: !`git branch --show-current`
```

Usage: `/user:git:status`

## Testing

Custom commands can be tested using the test script:
```bash
node test-custom-commands.cjs
```

## Current Status

✅ **Implemented Features:**
- Custom command discovery
- YAML frontmatter parsing
- Dynamic content processing
- Argument substitution
- Bash command execution
- File reference inclusion
- Namespace support
- Integration with existing slash command system

✅ **Testing:**
- Unit tests for core functions
- Integration with CLI
- Real-world command examples

✅ **Documentation:**
- Implementation documentation
- Usage examples
- API reference

The implementation is complete and functional. Custom slash commands are now available in gemini-cli. 