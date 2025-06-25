/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTranslation } from 'react-i18next';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from '@google/gemini-cli-core';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  const { t } = useTranslation();
  const geminiMdFileCount = config.getGeminiMdFileCount();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={Colors.Foreground}>{t('Tips for getting started:')}</Text>
      <Text color={Colors.Foreground}>
        1. {t('Ask questions, edit files, or run commands.')}
      </Text>
      <Text color={Colors.Foreground}>
        2. {t('Be specific for the best results.')}
      </Text>
      {geminiMdFileCount === 0 && (
        <Text color={Colors.Foreground}>
          3. Create{' '}
          <Text bold color={Colors.AccentPurple}>
            GEMINI.md
          </Text>{' '}
          {t('files to customize your interactions with Gemini.')}
        </Text>
      )}
      <Text color={Colors.Foreground}>
        {geminiMdFileCount === 0 ? '4.' : '3.'}{' '}
        <Text bold color={Colors.AccentPurple}>
          /help
        </Text>{' '}
        {t('for more information.')}
      </Text>
    </Box>
  );
};
