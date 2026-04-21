import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { PromptCache } from './cache.js';
import { resolveIncludes } from './composition/index.js';
import { applyOverrides } from './overrides/index.js';
import { parsePrompt, loadPromptFile } from './parser/index.js';
import type { PromptAsset, PromptAssetOverrides, ResolvedPromptAsset } from './schema/index.js';

export type PromptResolutionMode = 'auto' | 'compiled-only' | 'source-only';

export interface PromptResolutionConfig {
  sourceDir: string;
  compiledDir?: string;
  mode?: PromptResolutionMode;
  cache?: boolean;
}

const sharedPromptCache = new PromptCache<PromptAsset>();

export async function loadPromptAsset(
  promptPath: string,
  config: PromptResolutionConfig,
  promptCache: PromptCache<PromptAsset> = sharedPromptCache,
): Promise<PromptAsset> {
  const mode = config.mode ?? 'auto';

  if (mode !== 'source-only' && config.compiledDir) {
    const compiledFile = resolve(config.compiledDir, promptPath + '.json');
    if (existsSync(compiledFile)) {
      if (mode === 'auto') {
        const sourceFile = resolve(config.sourceDir, promptPath + '.md');
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
    const sourceFile = resolve(config.sourceDir, promptPath + '.md');

    if (config.cache !== false) {
      const cached = promptCache.get(sourceFile);
      if (cached) {
        return cached;
      }
    }

    if (!existsSync(sourceFile)) {
      const paths = [sourceFile];
      if (config.compiledDir) {
        paths.unshift(resolve(config.compiledDir, promptPath + '.json'));
      }

      throw new Error(
        `Prompt not found: "${promptPath}"\nSearched:\n${paths.map((candidate) => `  - ${candidate}`).join('\n')}`,
      );
    }

    const { asset } = await loadPromptFile(sourceFile, { defaultsRoot: config.sourceDir });

    if (config.cache !== false) {
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
  let asset = await loadPromptAsset(promptPath, config, promptCache);

  const sourceFile = resolve(config.sourceDir, promptPath + '.md');
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