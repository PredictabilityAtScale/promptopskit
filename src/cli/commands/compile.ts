import { readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, extname, relative, dirname } from 'node:path';
import { loadPromptFile } from '../../parser/index.js';
import { resolveIncludes } from '../../composition/index.js';

const HELP = `
promptopskit compile [sourceDir] [outputDir] [options]

Compile .md prompt files to JSON or ESM artifacts.

Options:
  --source, -s   Source directory (default: ./prompts)
  --output, -o   Output directory (default: ./.generated-prompts/<format>)
  --no-clean     Don't clear the output directory before compiling
  --dry-run      Show what would be compiled without writing files
  --format       Output format: json (default) or esm
  --help, -h     Show this help
`.trim();

export async function compile(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const positional = getPositionalArgs(args, new Set(['--format', '--source', '--output', '-s', '-o']));
  const dryRun = args.includes('--dry-run');
  const noClean = args.includes('--no-clean');
  const format = getFlag(args, '--format') ?? 'json';

  if (format !== 'json' && format !== 'esm') {
    console.error(`Error: Unknown format "${format}". Use "json" or "esm".`);
    process.exit(1);
  }

  const sourceDir = getFlag(args, '--source', '-s') ?? positional[0] ?? './prompts';
  const outputDir = getFlag(args, '--output', '-o') ?? positional[1] ?? defaultOutputDirForFormat(format);

  // Collect prompt files
  const files = await collectPromptFiles(sourceDir);

  if (files.length === 0) {
    console.log(`No .md prompt files found in ${sourceDir}`);
    return;
  }

  // Clean output dir
  if (!noClean && !dryRun) {
    await rm(outputDir, { recursive: true, force: true });
  }

  let compiled = 0;
  let errors = 0;

  for (const file of files) {
    const rel = relative(sourceDir, file).replace(/\.md$/, '');
    const outExt = format === 'esm' ? '.mjs' : '.json';
    const outPath = join(outputDir, rel + outExt);

    try {
      const { asset: parsed } = await loadPromptFile(file, { defaultsRoot: sourceDir });

      // Resolve includes so compiled artifacts are self-sufficient
      const asset = (parsed.includes && parsed.includes.length > 0)
        ? await resolveIncludes(parsed, file)
        : parsed;

      if (dryRun) {
        console.log(`  Would create: ${outPath}`);
      } else {
        await mkdir(dirname(outPath), { recursive: true });

        if (format === 'esm') {
          const esmContent = `export default ${JSON.stringify(asset, null, 2)};\n`;
          await writeFile(outPath, esmContent, 'utf-8');
        } else {
          await writeFile(outPath, JSON.stringify(asset, null, 2) + '\n', 'utf-8');
        }
        console.log(`  ✓ ${outPath}`);
      }
      compiled++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${file}`);
      console.error(`    ${message}`);
    }
  }

  console.log();
  if (dryRun) {
    console.log(`Dry run: ${compiled} file(s) would be compiled, ${errors} error(s)`);
  } else {
    console.log(`Compiled ${compiled} file(s), ${errors} error(s)`);
  }

  if (errors > 0) {
    process.exit(1);
  }
}

function defaultOutputDirForFormat(format: 'json' | 'esm'): string {
  return format === 'esm' ? './.generated-prompts/esm' : './.generated-prompts/json';
}

function getPositionalArgs(args: string[], flagsWithValues: Set<string>): string[] {
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (flagsWithValues.has(arg)) {
      index++;
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
    const idx = args.indexOf(flag);
    if (idx >= 0 && idx + 1 < args.length) {
      return args[idx + 1];
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
