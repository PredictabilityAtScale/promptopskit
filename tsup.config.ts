import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entries
  {
    entry: {
      index: 'src/index.ts',
      testing: 'src/testing.ts',
      'providers/openai': 'src/providers/openai.ts',
      'providers/anthropic': 'src/providers/anthropic.ts',
      'providers/gemini': 'src/providers/gemini.ts',
      'providers/openrouter': 'src/providers/openrouter.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node20',
  },
  // CLI entry (with shebang)
  {
    entry: {
      'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'node20',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
