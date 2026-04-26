import matter from 'gray-matter';
import { PromptAssetSchema } from '../schema/index.js';
import type { PromptAsset } from '../schema/index.js';
import { assertRegexFrontMatterQuoting } from './frontmatter-guard.js';
import { extractSections } from './sections.js';

export interface ParseResult {
  asset: PromptAsset;
  raw: {
    frontMatter: Record<string, unknown>;
    body: string;
  };
}

/**
 * Parse a prompt markdown string (YAML front matter + markdown body)
 * into a validated PromptAsset.
 */
export function parsePrompt(content: string, filePath?: string): ParseResult {
  assertRegexFrontMatterQuoting(content, filePath);
  const { data: frontMatter, content: body } = matter(content);

  const sections = extractSections(body);

  const raw = {
    ...frontMatter,
    sections,
    source: filePath ? { file_path: filePath } : undefined,
  };

  const asset = PromptAssetSchema.parse(raw);

  return {
    asset,
    raw: {
      frontMatter: frontMatter as Record<string, unknown>,
      body,
    },
  };
}
