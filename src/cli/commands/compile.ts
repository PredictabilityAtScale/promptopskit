import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, extname, relative, dirname } from 'node:path';
import { parsePrompt } from '../../parser/index.js';

const HELP = `
promptopskit compile <sourceDir> <outputDir> [options]

Compile .md prompt files to JSON artifacts.

Options:
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

  const positional = args.filter((a) => !a.startsWith('--'));
  const sourceDir = positional[0];
  const outputDir = positional[1];

  if (!sourceDir || !outputDir) {
    console.error('Error: Please provide source and output directories.');
    console.error('Usage: promptopskit compile <sourceDir> <outputDir>');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const noClean = args.includes('--no-clean');
  const format = getFlag(args, '--format') ?? 'json';

  if (format !== 'json' && format !== 'esm') {
    console.error(`Error: Unknown format "${format}". Use "json" or "esm".`);
    process.exit(1);
  }

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
      const content = await readFile(file, 'utf-8');
      const { asset } = parsePrompt(content, file);

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

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

async function collectPromptFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile() && extname(entry.name) === '.md' && !entry.name.endsWith('.test.md')) {
      results.push(join(entry.parentPath ?? dir, entry.name));
    }
  }
  return results.sort();
}
