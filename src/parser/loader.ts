import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import matter from 'gray-matter';
import { parsePrompt } from './parser.js';
import type { ParseResult } from './parser.js';
import { extractSections } from './sections.js';
import { PromptDefaultsSchema } from '../schema/index.js';
import type { PromptDefaults } from '../schema/index.js';

const DEFAULTS_FILE_NAME = 'defaults.md';

export interface LoadPromptOptions {
  /**
   * Optional boundary directory for defaults discovery.
   * If provided, defaults are loaded from this directory down to the prompt directory.
   */
  defaultsRoot?: string;
}

/**
 * Load and parse a prompt file from disk.
 */
export async function loadPromptFile(filePath: string, options: LoadPromptOptions = {}): Promise<ParseResult> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parsePrompt(content, filePath);
  const defaults = await loadDefaultsForPath(filePath, options.defaultsRoot);
  const asset = applyDefaults(parsed.asset, defaults);

  return {
    ...parsed,
    asset,
  };
}

async function loadDefaultsForPath(filePath: string, defaultsRoot?: string): Promise<PromptDefaults> {
  const directories = getDirectoriesToCheck(filePath, defaultsRoot);
  let merged: PromptDefaults = {};

  for (const dir of directories) {
    const defaultsPath = join(dir, DEFAULTS_FILE_NAME);
    try {
      const defaultsContent = await readFile(defaultsPath, 'utf-8');
      const defaults = parseDefaults(defaultsContent);
      merged = mergeDefaults(merged, defaults);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return merged;
}

function getDirectoriesToCheck(filePath: string, defaultsRoot?: string): string[] {
  const dirs: string[] = [];
  let current = resolve(dirname(filePath));
  const boundary = defaultsRoot ? resolve(defaultsRoot) : undefined;

  while (true) {
    dirs.unshift(current);
    if ((boundary && current === boundary) || current === dirname(current)) {
      break;
    }
    current = dirname(current);
  }

  return dirs;
}

function parseDefaults(content: string): PromptDefaults {
  const { data: frontMatter, content: body } = matter(content);
  const sections = extractSections(body);

  return PromptDefaultsSchema.parse({
    ...frontMatter,
    sections: {
      system_instructions: sections.system_instructions,
    },
  });
}

function mergeDefaults(base: PromptDefaults, local: PromptDefaults): PromptDefaults {
  return {
    metadata: {
      ...(base.metadata ?? {}),
      ...(local.metadata ?? {}),
    },
    sections: {
      ...(base.sections ?? {}),
      ...(local.sections ?? {}),
    },
  };
}

function applyDefaults(asset: ParseResult['asset'], defaults: PromptDefaults): ParseResult['asset'] {
  const mergedMetadata = {
    ...(defaults.metadata ?? {}),
    ...(asset.metadata ?? {}),
  };
  const metadata = Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined;

  const systemInstructions = asset.sections?.system_instructions ?? defaults.sections?.system_instructions;

  return {
    ...asset,
    metadata,
    sections: {
      ...(asset.sections ?? {}),
      system_instructions: systemInstructions,
    },
  };
}
