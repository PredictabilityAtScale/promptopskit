import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';

const MARKER_START = '<!-- promptopskit:start -->';
const MARKER_END = '<!-- promptopskit:end -->';

const HELP = `
promptopskit skill [--target <target>] [--force]

Deploy AI agent instructions so coding assistants know how to
create and manage prompts using promptopskit.

By default, generates files for all major AI coding assistants:

  AGENTS.md                                          Codex, OpenCode, Cursor, Copilot
  CLAUDE.md                                          Claude Code (imports AGENTS.md)
  .github/instructions/promptopskit.instructions.md  GitHub Copilot (path-specific)
  .cursor/rules/promptopskit.mdc                     Cursor (project rule)

If a file already exists, the promptopskit section is merged (replaced
in-place or appended). Use --force to overwrite the entire file.

Options:
  --target, -t     Deploy only a specific target (agents, claude, copilot, cursor)
  --force, -f      Overwrite entire file instead of merging
  --help, -h       Show this help
`.trim();

const STUB_CONTENT = `# promptopskit

This project uses **promptopskit** to manage LLM prompts as code.
Read the full guide at \`node_modules/promptopskit/SKILL.md\` before
creating or editing prompt files.`;

const CLAUDE_LINE = '@AGENTS.md';

interface TargetConfig {
  path: string;
  wrap: (content: string) => string;
}

const TARGETS: Record<string, TargetConfig> = {
  agents: {
    path: 'AGENTS.md',
    wrap: (content) => content,
  },
  claude: {
    path: 'CLAUDE.md',
    wrap: () => CLAUDE_LINE + '\n',
  },
  copilot: {
    path: '.github/instructions/promptopskit.instructions.md',
    wrap: (content) =>
      `---\napplyTo: "**"\n---\n\n${content}`,
  },
  cursor: {
    path: '.cursor/rules/promptopskit.mdc',
    wrap: (content) =>
      `---\ndescription: How to create and manage prompts using promptopskit\nglobs: "**"\nalwaysApply: true\n---\n\n${content}`,
  },
};

const ALL_TARGETS = ['agents', 'claude', 'copilot', 'cursor'];

export async function skill(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const force = args.includes('--force') || args.includes('-f');

  let targets = ALL_TARGETS;
  const targetIdx = args.findIndex((a) => a === '--target' || a === '-t');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    const target = args[targetIdx + 1];
    const config = TARGETS[target];
    if (!config) {
      console.error(`Unknown target: ${target}`);
      console.error(`Valid targets: ${Object.keys(TARGETS).join(', ')}`);
      process.exit(1);
    }
    targets = [target];
  }

  let written = 0;
  for (const target of targets) {
    const config = TARGETS[target];
    const filePath = config.path;

    // CLAUDE.md uses a simple import line — handle dedup separately
    if (target === 'claude') {
      written += await deployClaude(filePath, force);
      continue;
    }

    const markedContent = config.wrap(wrapMarkers(STUB_CONTENT));

    if (existsSync(filePath) && !force) {
      const existing = await readFile(filePath, 'utf-8');
      const merged = mergeContent(existing, markedContent);
      if (merged === existing) {
        console.log(`  skip ${filePath} (already up to date)`);
        continue;
      }
      await writeFile(filePath, merged, 'utf-8');
      console.log(`  ✓ ${filePath} (merged)`);
      written++;
      continue;
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, markedContent, 'utf-8');
    console.log(`  ✓ ${filePath}`);
    written++;
  }

  if (written > 0) {
    console.log();
    console.log(`AI agents will now understand how to create and manage prompts with promptopskit.`);
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.md — append @AGENTS.md if not already present
// ---------------------------------------------------------------------------

async function deployClaude(filePath: string, force: boolean): Promise<number> {
  const content = CLAUDE_LINE + '\n';

  if (!existsSync(filePath) || force) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    console.log(`  ✓ ${filePath}`);
    return 1;
  }

  const existing = await readFile(filePath, 'utf-8');
  if (existing.split('\n').some((line) => line.trim() === CLAUDE_LINE)) {
    console.log(`  skip ${filePath} (already up to date)`);
    return 0;
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  await writeFile(filePath, existing + separator + content, 'utf-8');
  console.log(`  ✓ ${filePath} (merged)`);
  return 1;
}

// ---------------------------------------------------------------------------
// Marker helpers
// ---------------------------------------------------------------------------

function wrapMarkers(content: string): string {
  return `${MARKER_START}\n${content}\n${MARKER_END}`;
}

function mergeContent(existing: string, markedContent: string): string {
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  // Replace existing block in-place
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return (
      existing.slice(0, startIdx) +
      markedContent +
      existing.slice(endIdx + MARKER_END.length)
    );
  }

  // Append to end
  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return existing + separator + markedContent + '\n';
}
