import { resolve, dirname } from 'node:path';
import { loadPromptFile } from '../parser/index.js';
import type { PromptAsset } from '../schema/index.js';

/**
 * Resolve includes for a prompt asset, inlining content from referenced files.
 * Detects and rejects circular includes.
 */
export async function resolveIncludes(
  asset: PromptAsset,
  basePath: string,
  visited: Set<string> = new Set(),
): Promise<PromptAsset> {
  if (!asset.includes || asset.includes.length === 0) {
    return asset;
  }

  const baseDir = dirname(basePath);
  const resolvedPath = resolve(basePath);

  if (visited.has(resolvedPath)) {
    throw new Error(`Circular include detected: ${resolvedPath}`);
  }
  visited.add(resolvedPath);

  let mergedSystemInstructions = '';

  for (const includePath of asset.includes) {
    const fullPath = resolve(baseDir, includePath);

    if (visited.has(fullPath)) {
      throw new Error(`Circular include detected: ${fullPath} (included from ${basePath})`);
    }

    const { asset: includedAsset } = await loadPromptFile(fullPath);

    // Recursively resolve nested includes
    const resolved = await resolveIncludes(includedAsset, fullPath, new Set(visited));

    // Append included system instructions before local ones
    if (resolved.sections?.system_instructions) {
      mergedSystemInstructions += resolved.sections.system_instructions + '\n\n';
    }
  }

  // Prepend included system instructions before the local ones
  const localSystem = asset.sections?.system_instructions ?? '';
  const combinedSystem = (mergedSystemInstructions + localSystem).trim() || undefined;

  return {
    ...asset,
    sections: {
      ...asset.sections,
      system_instructions: combinedSystem,
    },
    // Drop includes from the resolved asset — they've been inlined
    includes: undefined,
  };
}
