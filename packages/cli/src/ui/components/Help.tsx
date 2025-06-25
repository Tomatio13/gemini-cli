/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from 'react-i18next';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../hooks/slashCommandProcessor.js';

interface Help {
  commands: SlashCommand[];
}

export const Help = ({ commands }: Help) => {
  const { t } = useTranslation();
  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderColor={Colors.Gray}
      borderStyle="round"
      padding={1}
    >
      {/* Basics */}
      <Text bold color={Colors.Foreground}>
        {t('Basics:')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('Add context')}
        </Text>
        : {t('Use')}{' '}
        <Text bold color={Colors.AccentPurple}>
          @
        </Text>{' '}
        {t('to specify files for context (e.g.,')}{' '}
        <Text bold color={Colors.AccentPurple}>
          @src/myFile.ts
        </Text>
        {t(') to target specific files or folders.')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('Shell mode')}
        </Text>
        : {t('Execute shell commands via')}{' '}
        <Text bold color={Colors.AccentPurple}>
          !
        </Text>{' '}
        {t('(e.g.,')}{' '}
        <Text bold color={Colors.AccentPurple}>
          !npm run start
        </Text>
        {t(') or use natural language (e.g.')}{' '}
        <Text bold color={Colors.AccentPurple}>
          {t('start server')}
        </Text>
        ).
      </Text>

      <Box height={1} />

      {/* Commands */}
      <Text bold color={Colors.Foreground}>
        {t('Commands:')}
      </Text>
      {commands
        .filter((command) => command.description)
        .map((command: SlashCommand) => (
          <Text key={command.name} color={Colors.Foreground}>
            <Text bold color={Colors.AccentPurple}>
              {' '}
              /{command.name}
            </Text>
            {command.description && ' - ' + command.description}
          </Text>
        ))}
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {' '}
          !{' '}
        </Text>
        - {t('shell command')}
      </Text>

      <Box height={1} />

      {/* Shortcuts */}
      <Text bold color={Colors.Foreground}>
        {t('Keyboard Shortcuts:')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Enter
        </Text>{' '}
        - {t('Send message')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Shift+Enter
        </Text>{' '}
        - {t('New line')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Up/Down
        </Text>{' '}
        - {t('Cycle through your prompt history')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Alt+Left/Right
        </Text>{' '}
        - {t('Jump through words in the input')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Esc
        </Text>{' '}
        - {t('Cancel operation')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+C
        </Text>{' '}
        - {t('Quit application')}
      </Text>
    </Box>
  );
};
