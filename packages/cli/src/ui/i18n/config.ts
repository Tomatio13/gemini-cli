/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable import/no-named-as-default-member, import/no-default-export */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to read from bundle directory first, fallback to src directory
let jaJsonPath = join(__dirname, '../../../../ja.json'); // bundle/ja.json
if (!existsSync(jaJsonPath)) {
  jaJsonPath = join(__dirname, 'ja.json'); // src/ui/i18n/ja.json
}

const ja = JSON.parse(readFileSync(jaJsonPath, 'utf-8'));

i18n.use(initReactI18next).init({
  resources: {
    ja,
  },
  lng: 'ja',
  fallbackLng: 'en',
  debug: false,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
