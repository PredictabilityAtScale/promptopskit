import { readFile } from 'node:fs/promises';
import { parsePrompt } from '../../parser/index.js';

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

  const content = await readFile(file, 'utf-8');
  const { asset } = parsePrompt(content, file);

  console.log(JSON.stringify(asset, null, 2));
}
