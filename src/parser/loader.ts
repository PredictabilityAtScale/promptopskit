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
  // Default the boundary to the file's own directory so traversal never
  // walks above the prompt tree when no explicit root is provided.
  const root = options.defaultsRoot ?? dirname(filePath);
  const defaults = await loadDefaultsForPath(filePath, root);
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
    provider: local.provider ?? base.provider,
    model: local.model ?? base.model,
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
  const hasDefaultMetadata = defaults.metadata && Object.keys(defaults.metadata).length > 0;
  const hasDefaultSystem = !!defaults.sections?.system_instructions;
  const hasDefaultScalars = defaults.provider !== undefined
    || defaults.model !== undefined;

  // Short-circuit: nothing to merge
  if (!hasDefaultMetadata && !hasDefaultSystem && !hasDefaultScalars) {
    return asset;
  }

  const mergedMetadata = {
    ...(defaults.metadata ?? {}),
    ...(asset.metadata ?? {}),
  };
  const metadata = Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined;

  const systemInstructions = asset.sections?.system_instructions ?? defaults.sections?.system_instructions;

  const sections = asset.sections
    ? { ...asset.sections, system_instructions: systemInstructions }
    : systemInstructions
      ? { system_instructions: systemInstructions }
      : undefined;

  return {
    ...asset,
    provider: asset.provider ?? defaults.provider,
    model: asset.model ?? defaults.model,
    metadata,
    sections,
  };
}
