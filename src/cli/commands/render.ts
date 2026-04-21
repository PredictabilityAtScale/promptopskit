import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadPromptFile } from '../../parser/index.js';
import { resolveIncludes } from '../../composition/index.js';
import { applyOverrides } from '../../overrides/index.js';
import { interpolate } from '../../renderer/interpolate.js';
import { findDefaultsRoot } from './defaults-root.js';

const HELP = `
promptopskit render <file> [options]

Render a prompt preview with variables.

Options:
  --env <name>       Environment override
  --tier <name>      Tier override
  --vars <file>      JSON file with variables
  --json             Output raw JSON instead of readable format
  --help, -h         Show this help
`.trim();

export async function render(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Error: Please provide a prompt file to render.');
    process.exit(1);
  }

  const env = getFlag(args, '--env');
  const tier = getFlag(args, '--tier');
  const varsFile = getFlag(args, '--vars');
  const jsonOutput = args.includes('--json');

  // Load variables from file or sidecar
  let variables: Record<string, string> = {};

  if (varsFile) {
    const varsContent = await readFile(varsFile, 'utf-8');
    variables = JSON.parse(varsContent);
  } else {
    // Try auto-loading sidecar .test.yaml
    const sidecarPath = file.replace(/\.md$/, '.test.yaml');
    if (existsSync(sidecarPath)) {
      const { default: yaml } = await import('gray-matter');
      const sidecarContent = await readFile(sidecarPath, 'utf-8');
      // Wrap in --- delimiters so gray-matter parses the entire file as front matter
      const parsed = yaml(`---\n${sidecarContent}---\n`);
      const data = parsed.data as { cases?: Array<{ variables?: Record<string, string> }> };
      if (data.cases?.[0]?.variables) {
        variables = data.cases[0].variables;
      }
    }
  }

  const defaultsRoot = findDefaultsRoot(file);
  const { asset: parsed } = await loadPromptFile(file, { defaultsRoot });

  // Resolve includes (matching the library pipeline)
  const resolved = (parsed.includes && parsed.includes.length > 0)
    ? await resolveIncludes(parsed, file)
    : parsed;

  // Apply overrides using the standard applyOverrides function
  const overridden = applyOverrides(resolved, {
    environment: env,
    tier: tier,
  });

  // Render sections with variables
  const renderedSystem = overridden.sections?.system_instructions
    ? interpolate(overridden.sections.system_instructions, variables)
    : undefined;
  const renderedPrompt = overridden.sections?.prompt_template
    ? interpolate(overridden.sections.prompt_template, variables)
    : undefined;

  if (jsonOutput) {
    console.log(JSON.stringify({
      id: overridden.id,
      provider: overridden.provider,
      model: overridden.model,
      system_instructions: renderedSystem,
      prompt_template: renderedPrompt,
      tools: overridden.tools,
    }, null, 2));
    return;
  }

  // Readable output
  const label = [
    overridden.provider,
    overridden.model,
    [env, tier].filter(Boolean).join('/'),
  ].filter(Boolean).join(', ');

  console.log(`── ${overridden.id} (${label}) ${'─'.repeat(Math.max(0, 50 - overridden.id.length - label.length))}`);

  if (renderedSystem) {
    console.log(`System: ${renderedSystem.split('\n')[0]}${renderedSystem.includes('\n') ? '...' : ''}`);
  }
  if (renderedPrompt) {
    console.log(`User:   ${renderedPrompt.split('\n')[0]}${renderedPrompt.includes('\n') ? '...' : ''}`);
  }
  if (overridden.tools?.length) {
    const toolNames = overridden.tools.map((t) => typeof t === 'string' ? t : t.name);
    console.log(`Tools:  ${toolNames.join(', ')}`);
  }
  console.log(`Model:  ${overridden.model ?? 'not set'}`);
  console.log('─'.repeat(60));
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}
