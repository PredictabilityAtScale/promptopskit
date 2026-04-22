import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { loadPromptFile } from '../../parser/index.js';
import { validateAssetWithIncludes } from '../../validation/index.js';
import { DEFAULT_PROMPTS_DIR } from '../../prompt-resolution.js';

const HELP = `
promptopskit validate [sourceDir] [options]

Validate all prompt .md files in a directory.

Options:
  --source, -s  Source directory (default: ./prompts)
  --strict       Treat warnings as errors
  --help, -h     Show this help
`.trim();

export async function validate(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const positional = getPositionalArgs(args, new Set(['--source', '-s']));
  const dir = getFlag(args, '--source', '-s') ?? positional[0] ?? DEFAULT_PROMPTS_DIR;
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

function getPositionalArgs(args: string[], flagsWithValues: Set<string>): string[] {
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (flagsWithValues.has(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    positional.push(arg);
  }

  return positional;
}

function getFlag(args: string[], ...flags: string[]): string | undefined {
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index >= 0 && index + 1 < args.length) {
      return args[index + 1];
    }
  }

  return undefined;
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
