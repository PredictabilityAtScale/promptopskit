import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import matter from 'gray-matter';
import { parsePrompt } from './parser.js';
import type { ParseResult } from './parser.js';
import { extractSections } from './sections.js';
import { PromptDefaultsSchema } from '../schema/index.js';
import type { PromptDefaults } from '../schema/index.js';
import { resolveResponseSchemaRef } from './response-schema-ref.js';

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
  const withDefaults = applyDefaults(parsed.asset, defaults);
  const resolved = await resolveResponseSchemaRef(withDefaults, filePath);
  const asset = (resolved.response?.schema !== undefined && !resolved.response?.schema_source)
    ? {
      ...resolved,
      response: {
        ...resolved.response,
        schema_source: { mode: 'inline' as const },
      },
    }
    : resolved;

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
    cache: mergeCache(base.cache, local.cache),
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
  const cache = mergeCache(defaults.cache, asset.cache);
  const hasDefaultMetadata = defaults.metadata && Object.keys(defaults.metadata).length > 0;
  const hasDefaultSystem = !!defaults.sections?.system_instructions;
  const hasDefaultScalars = defaults.provider !== undefined
    || defaults.model !== undefined;
  const hasDefaultCache = cache !== undefined;

  // Short-circuit: nothing to merge
  if (!hasDefaultMetadata && !hasDefaultSystem && !hasDefaultScalars && !hasDefaultCache) {
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
    cache,
    metadata,
    sections,
  };
}

function mergeCache(base: PromptDefaults['cache'], local: PromptDefaults['cache']): PromptDefaults['cache'] {
  const merged: NonNullable<PromptDefaults['cache']> = {
    ...(base ?? {}),
    ...(local ?? {}),
    openai: {
      ...(base?.openai ?? {}),
      ...(local?.openai ?? {}),
    },
    anthropic: {
      ...(base?.anthropic ?? {}),
      ...(local?.anthropic ?? {}),
    },
    gemini: {
      ...(base?.gemini ?? {}),
      ...(local?.gemini ?? {}),
    },
    google: {
      ...(base?.google ?? {}),
      ...(local?.google ?? {}),
    },
  };

  if (merged.openai && Object.keys(merged.openai).length === 0) delete merged.openai;
  if (merged.anthropic && Object.keys(merged.anthropic).length === 0) delete merged.anthropic;
  if (merged.gemini && Object.keys(merged.gemini).length === 0) delete merged.gemini;
  if (merged.google && Object.keys(merged.google).length === 0) delete merged.google;

  return Object.keys(merged).length > 0 ? merged : undefined;
}
