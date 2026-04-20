import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { loadPromptFile } from '../../parser/index.js';
import { validateAssetWithIncludes } from '../../validation/index.js';

const HELP = `
promptopskit validate <dir>

Validate all prompt .md files in a directory.

Options:
  --strict       Treat warnings as errors
  --help, -h     Show this help
`.trim();

export async function validate(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('Error: Please provide a directory to validate.');
    process.exit(1);
  }

  const strict = args.includes('--strict');
  const files = await collectPromptFiles(dir);

  if (files.length === 0) {
    console.log(`No .md prompt files found in ${dir}`);
    return;
  }

  let errorCount = 0;
  let warnCount = 0;

  for (const file of files) {
    try {
      const { asset, raw } = await loadPromptFile(file, { defaultsRoot: dir });
      const result = await validateAssetWithIncludes(asset, file, Object.keys(raw.frontMatter));

      if (result.errors.length > 0) {
        errorCount += result.errors.length;
        console.error(`  ✗ ${file}`);
        for (const err of result.errors) {
          console.error(`    ${err.code}: ${err.message}`);
        }
      } else {
        console.log(`  ✓ ${file}`);
      }

      if (result.warnings.length > 0) {
        warnCount += result.warnings.length;
        for (const warn of result.warnings) {
          const suggestion = warn.suggestion ? ` (${warn.suggestion})` : '';
          console.warn(`    ⚠ ${warn.code}: ${warn.message}${suggestion}`);
        }
      }
    } catch (err) {
      errorCount++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${file}`);
      console.error(`    ${message}`);
    }
  }

  console.log();
  console.log(`Validated ${files.length} file(s): ${errorCount} error(s), ${warnCount} warning(s)`);

  if (errorCount > 0 || (strict && warnCount > 0)) {
    process.exit(1);
  }
}

async function collectPromptFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (
      entry.isFile()
      && extname(entry.name) === '.md'
      && !entry.name.endsWith('.test.md')
      && entry.name !== 'defaults.md'
    ) {
      results.push(join(entry.parentPath ?? dir, entry.name));
    }
  }
  return results.sort();
}
