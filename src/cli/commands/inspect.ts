import { loadPromptFile } from '../../parser/index.js';
import { resolveIncludes } from '../../composition/index.js';
import { findDefaultsRoot } from './defaults-root.js';

const HELP = `
promptopskit inspect <file>

Print the normalized prompt asset as JSON.

Options:
  --help, -h     Show this help
`.trim();

export async function inspect(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Error: Please provide a prompt file to inspect.');
    process.exit(1);
  }

  const defaultsRoot = findDefaultsRoot(file);
  const { asset: parsed } = await loadPromptFile(file, { defaultsRoot });

  // Resolve includes so the output shows the fully resolved asset
  const asset = (parsed.includes && parsed.includes.length > 0)
    ? await resolveIncludes(parsed, file)
    : parsed;

  console.log(JSON.stringify(asset, null, 2));
}
