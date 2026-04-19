import { validate } from './commands/validate.js';
import { compile } from './commands/compile.js';
import { render } from './commands/render.js';
import { inspect } from './commands/inspect.js';
import { init } from './commands/init.js';
import { skill } from './commands/skill.js';

const HELP = `
promptopskit — Manage prompts, system instructions, tools, and model settings as code

Usage:
  promptopskit <command> [options]

Commands:
  init [dir]                           Scaffold a prompts directory with starter files
  validate <dir>                       Validate prompt files
  compile <src> <out> [options]        Compile .md prompts to JSON/ESM artifacts
  render <file> [options]              Render a prompt preview
  inspect <file>                       Print normalized prompt asset
  skill [options]                      Deploy AI agent instructions into your project

Options:
  --help, -h                           Show this help message
  --version, -v                        Show version

Run promptopskit <command> --help for command-specific help.
`.trim();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    // Dynamic import to read version from package.json
    console.log('0.0.1');
    process.exit(0);
  }

  const commandArgs = args.slice(1);

  switch (command) {
    case 'init':
      await init(commandArgs);
      break;
    case 'validate':
      await validate(commandArgs);
      break;
    case 'compile':
      await compile(commandArgs);
      break;
    case 'render':
      await render(commandArgs);
      break;
    case 'inspect':
      await inspect(commandArgs);
      break;
    case 'skill':
      await skill(commandArgs);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
