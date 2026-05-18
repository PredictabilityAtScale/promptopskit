import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
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
      const defaults = normalizeDefaultIncludes(parseDefaults(defaultsContent), defaultsPath, filePath);
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
    fallback_models: local.fallback_models ?? base.fallback_models,
    reasoning: mergeRecordBlock(base.reasoning, local.reasoning),
    sampling: mergeRecordBlock(base.sampling, local.sampling),
    response: mergeRecordBlock(base.response, local.response),
    cache: mergeCache(base.cache, local.cache),
    raw: mergeRaw(base.raw, local.raw),
    tools: local.tools ?? base.tools,
    provider_options: mergeProviderOptions(base.provider_options, local.provider_options),
    mcp: mergeMcp(base.mcp, local.mcp),
    context: mergeContext(base.context, local.context),
    includes: local.includes ?? base.includes,
    environments: mergeOverrideMap(base.environments, local.environments),
    tiers: mergeOverrideMap(base.tiers, local.tiers),
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
  const raw = mergeRaw(defaults.raw, asset.raw);
  const providerOptions = mergeProviderOptions(defaults.provider_options, asset.provider_options);
  const reasoning = mergeRecordBlock(defaults.reasoning, asset.reasoning);
  const sampling = mergeRecordBlock(defaults.sampling, asset.sampling);
  const response = mergeRecordBlock(defaults.response, asset.response);
  const mcp = mergeMcp(defaults.mcp, asset.mcp);
  const context = mergeContext(defaults.context, asset.context);
  const environments = mergeOverrideMap(defaults.environments, asset.environments);
  const tiers = mergeOverrideMap(defaults.tiers, asset.tiers);
  const hasDefaultMetadata = defaults.metadata && Object.keys(defaults.metadata).length > 0;
  const hasDefaultSystem = !!defaults.sections?.system_instructions;
  const hasDefaultScalars = defaults.provider !== undefined
    || defaults.model !== undefined
    || defaults.fallback_models !== undefined
    || defaults.tools !== undefined
    || defaults.includes !== undefined;
  const hasDefaultObjects = cache !== undefined
    || raw !== undefined
    || providerOptions !== undefined
    || reasoning !== undefined
    || sampling !== undefined
    || response !== undefined
    || mcp !== undefined
    || context !== undefined
    || environments !== undefined
    || tiers !== undefined;

  // Short-circuit: nothing to merge
  if (!hasDefaultMetadata && !hasDefaultSystem && !hasDefaultScalars && !hasDefaultObjects) {
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
    fallback_models: asset.fallback_models ?? defaults.fallback_models,
    reasoning,
    sampling,
    response,
    cache,
    raw,
    tools: asset.tools ?? defaults.tools,
    provider_options: providerOptions,
    mcp,
    context,
    includes: asset.includes ?? defaults.includes,
    environments,
    tiers,
    metadata,
    sections,
  };
}

function normalizeDefaultIncludes(
  defaults: PromptDefaults,
  defaultsPath: string,
  filePath: string,
): PromptDefaults {
  if (!defaults.includes) return defaults;

  const promptDir = dirname(filePath);
  const defaultsDir = dirname(defaultsPath);
  const includes = defaults.includes.map((includePath) => {
    const relativePath = relative(promptDir, resolve(defaultsDir, includePath)).replace(/\\/g, '/');
    return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  });

  return {
    ...defaults,
    includes,
  };
}

function mergeRecordBlock<T extends object>(base: T | undefined, local: T | undefined): T | undefined {
  if (base === undefined) return local;
  if (local === undefined) return base;
  return { ...base, ...local };
}

function mergeMcp(base: PromptDefaults['mcp'], local: PromptDefaults['mcp']): PromptDefaults['mcp'] {
  return mergeRecordBlock(base, local);
}

function mergeContext(base: PromptDefaults['context'], local: PromptDefaults['context']): PromptDefaults['context'] {
  const merged = {
    ...(base ?? {}),
    ...(local ?? {}),
    history: mergeRecordBlock(base?.history, local?.history),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
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

function mergeRaw(base: PromptDefaults['raw'], local: PromptDefaults['raw']): PromptDefaults['raw'] {
  const merged: NonNullable<PromptDefaults['raw']> = {
    ...(base ?? {}),
    ...(local ?? {}),
    openai: mergeRecordBlock(base?.openai, local?.openai),
    'openai-responses': mergeRecordBlock(base?.['openai-responses'], local?.['openai-responses']),
    openai_responses: mergeRecordBlock(base?.openai_responses, local?.openai_responses),
    anthropic: mergeRecordBlock(base?.anthropic, local?.anthropic),
    gemini: mergeRecordBlock(base?.gemini, local?.gemini),
    google: mergeRecordBlock(base?.google, local?.google),
    openrouter: mergeRecordBlock(base?.openrouter, local?.openrouter),
    llmasaservice: mergeRecordBlock(base?.llmasaservice, local?.llmasaservice),
  };

  removeEmptyProviderBlocks(merged);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeProviderOptions(
  base: PromptDefaults['provider_options'],
  local: PromptDefaults['provider_options'],
): PromptDefaults['provider_options'] {
  const merged: NonNullable<PromptDefaults['provider_options']> = {
    ...(base ?? {}),
    ...(local ?? {}),
    anthropic: mergeRecordBlock(base?.anthropic, local?.anthropic),
    gemini: mergeRecordBlock(base?.gemini, local?.gemini),
    openrouter: mergeRecordBlock(base?.openrouter, local?.openrouter),
    llmasaservice: mergeRecordBlock(base?.llmasaservice, local?.llmasaservice),
  };

  removeEmptyProviderBlocks(merged);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeOverrideMap(
  base: PromptDefaults['environments'],
  local: PromptDefaults['environments'],
): PromptDefaults['environments'] {
  const merged: NonNullable<PromptDefaults['environments']> = { ...(base ?? {}) };

  for (const [name, localOverride] of Object.entries(local ?? {})) {
    merged[name] = mergeOverrideConfig(merged[name], localOverride);
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeOverrideConfig(
  base: NonNullable<PromptDefaults['environments']>[string] | undefined,
  local: NonNullable<PromptDefaults['environments']>[string],
): NonNullable<PromptDefaults['environments']>[string] {
  const merged: NonNullable<PromptDefaults['environments']>[string] = {
    ...(base ?? {}),
    ...local,
  };

  const reasoning = mergeRecordBlock(base?.reasoning, local.reasoning);
  const sampling = mergeRecordBlock(base?.sampling, local.sampling);
  const response = mergeRecordBlock(base?.response, local.response);
  const cache = mergeCache(base?.cache, local.cache);
  const raw = mergeRaw(base?.raw, local.raw);
  const providerOptions = mergeProviderOptions(base?.provider_options, local.provider_options);

  if (reasoning !== undefined) merged.reasoning = reasoning;
  if (sampling !== undefined) merged.sampling = sampling;
  if (response !== undefined) merged.response = response;
  if (cache !== undefined) merged.cache = cache;
  if (raw !== undefined) merged.raw = raw;
  if (providerOptions !== undefined) merged.provider_options = providerOptions;

  return merged;
}

function removeEmptyProviderBlocks<T extends Record<string, unknown>>(value: T): void {
  for (const key of Object.keys(value)) {
    const block = value[key];
    if (block === undefined) {
      delete value[key];
      continue;
    }

    if (
      block !== null
      &&
      typeof block === 'object'
      && !Array.isArray(block)
      && Object.keys(block).length === 0
    ) {
      delete value[key];
    }
  }
}
