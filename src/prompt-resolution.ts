import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { PromptCache } from './cache.js';
import { resolveIncludes } from './composition/index.js';
import { applyOverrides } from './overrides/index.js';
import { parsePrompt, loadPromptFile } from './parser/index.js';
import type { PromptAsset, PromptAssetOverrides, ResolvedPromptAsset } from './schema/index.js';

export type PromptResolutionMode = 'auto' | 'compiled-only' | 'source-only';

export const DEFAULT_PROMPTS_DIR = './prompts';
export const DEFAULT_COMPILED_JSON_DIR = './.generated-prompts/json';
export const DEFAULT_COMPILED_ESM_DIR = './.generated-prompts/esm';

export interface PromptResolutionConfig {
  sourceDir?: string;
  compiledDir?: string;
  mode?: PromptResolutionMode;
  cache?: boolean;
}

export interface ResolvedPromptResolutionConfig {
  sourceDir: string;
  compiledDir: string;
  mode?: PromptResolutionMode;
  cache?: boolean;
}

export function defaultCompiledDirForFormat(format: 'json' | 'esm'): string {
  return format === 'esm' ? DEFAULT_COMPILED_ESM_DIR : DEFAULT_COMPILED_JSON_DIR;
}

export function withPromptResolutionDefaults(config: PromptResolutionConfig): ResolvedPromptResolutionConfig {
  return {
    ...config,
    sourceDir: config.sourceDir ?? DEFAULT_PROMPTS_DIR,
    compiledDir: config.compiledDir ?? DEFAULT_COMPILED_JSON_DIR,
  };
}

const sharedPromptCache = new PromptCache<PromptAsset>();

export async function loadPromptAsset(
  promptPath: string,
  config: PromptResolutionConfig,
  promptCache: PromptCache<PromptAsset> = sharedPromptCache,
): Promise<PromptAsset> {
  const resolvedConfig = withPromptResolutionDefaults(config);
  const mode = resolvedConfig.mode ?? 'auto';

  if (mode !== 'source-only' && resolvedConfig.compiledDir) {
    const compiledFile = resolve(resolvedConfig.compiledDir, promptPath + '.json');
    if (existsSync(compiledFile)) {
      if (mode === 'auto') {
        const sourceFile = resolve(resolvedConfig.sourceDir, promptPath + '.md');
        if (existsSync(sourceFile)) {
          const compiledMtime = statSync(compiledFile).mtimeMs;
          const sourceMtime = statSync(sourceFile).mtimeMs;
          if (sourceMtime > compiledMtime) {
            console.warn(
              `[promptopskit] Warning: compiled artifact for "${promptPath}" is older than source .md file.\n`
              + '               Run "promptopskit compile" or switch to source-only mode.',
            );
          }
        }
      }

      const content = await readFile(compiledFile, 'utf-8');
      return JSON.parse(content) as PromptAsset;
    }

    if (mode === 'compiled-only') {
      throw new Error(
        `Compiled artifact not found: ${compiledFile}\n`
        + 'Run "promptopskit compile" to generate it.',
      );
    }
  }

  if (mode !== 'compiled-only') {
    const sourceFile = resolve(resolvedConfig.sourceDir, promptPath + '.md');

    if (resolvedConfig.cache !== false) {
      const cached = promptCache.get(sourceFile);
      if (cached) {
        return cached;
      }
    }

    if (!existsSync(sourceFile)) {
      const paths = [sourceFile];
      if (resolvedConfig.compiledDir) {
        paths.unshift(resolve(resolvedConfig.compiledDir, promptPath + '.json'));
      }

      throw new Error(
        `Prompt not found: "${promptPath}"\nSearched:\n${paths.map((candidate) => `  - ${candidate}`).join('\n')}`,
      );
    }

    const { asset } = await loadPromptFile(sourceFile, { defaultsRoot: resolvedConfig.sourceDir });

    if (resolvedConfig.cache !== false) {
      promptCache.set(sourceFile, asset);
    }

    return asset;
  }

  throw new Error(`Prompt not found: "${promptPath}"`);
}

export async function resolvePromptAsset(
  promptPath: string,
  config: PromptResolutionConfig,
  options: { environment?: string; tier?: string; runtime?: Partial<PromptAssetOverrides> } = {},
  promptCache: PromptCache<PromptAsset> = sharedPromptCache,
): Promise<ResolvedPromptAsset> {
  const resolvedConfig = withPromptResolutionDefaults(config);
  let asset = await loadPromptAsset(promptPath, resolvedConfig, promptCache);

  const sourceFile = resolve(resolvedConfig.sourceDir, promptPath + '.md');
  if (asset.includes && asset.includes.length > 0 && existsSync(sourceFile)) {
    asset = await resolveIncludes(asset, sourceFile);
  }

  asset = applyOverrides(asset, {
    environment: options.environment,
    tier: options.tier,
    runtime: options.runtime,
  });

  return asset as ResolvedPromptAsset;
}

export function resolveInlinePromptSource(
  source: string,
  options: { environment?: string; tier?: string; runtime?: Partial<PromptAssetOverrides> } = {},
): ResolvedPromptAsset {
  const { asset } = parsePrompt(source);
  return applyOverrides(asset, {
    environment: options.environment,
    tier: options.tier,
    runtime: options.runtime,
  }) as ResolvedPromptAsset;
}