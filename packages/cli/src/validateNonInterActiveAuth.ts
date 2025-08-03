/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, Config } from '@google/gemini-cli-core';
import { USER_SETTINGS_PATH } from './config/settings.js';
import { validateAuthMethod } from './config/auth.js';

function getAuthTypeFromEnv(): AuthType | undefined {
  if (process.env.GOOGLE_GENAI_USE_GCA === 'true') {
    return AuthType.LOGIN_WITH_GOOGLE;
  }
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true') {
    return AuthType.USE_VERTEX_AI;
  }
  // Prioritize Gemini API key over others to prevent unwanted auto-switching
  if (process.env.GEMINI_API_KEY) {
    return AuthType.USE_GEMINI;
  }
  if (process.env.GOOGLE_API_KEY) {
    return AuthType.USE_VERTEX_AI;
  }
  if (process.env.OPENAI_API_KEY) {
    // Only use OpenAI if no Gemini keys are available
    return AuthType.USE_OPENAI_COMPATIBLE;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return AuthType.USE_ANTHROPIC;
  }
  return undefined;
}

export async function validateNonInteractiveAuth(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: Config,
) {
  // Get CLI authType first - this should take highest priority
  const cliAuthType = nonInteractiveConfig.getAuthType();
  
  let selectedAuthType: AuthType | undefined;
  if (cliAuthType) {
    selectedAuthType = cliAuthType as AuthType;
  } else {
    selectedAuthType = configuredAuthType || getAuthTypeFromEnv();
  }
  
  const effectiveAuthType = selectedAuthType;

  if (!effectiveAuthType) {
    console.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`,
    );
    process.exit(1);
  }

  if (!useExternalAuth) {
    const err = validateAuthMethod(effectiveAuthType);
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }

  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  return nonInteractiveConfig;
}
