import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HELP = `
promptopskit init [dir]

Scaffold a prompts directory with starter files.

Options:
  --help, -h     Show this help
`.trim();

const HELLO_PROMPT = `---
id: hello
schema_version: 1
provider: openai
model: gpt-5.4
context:
  inputs:
    - name
    - app_context
includes:
  - ./shared/tone.md
---

# System instructions

You are a friendly assistant. Be helpful and concise.
Current app context: {{ app_context }}.

# Prompt template

Say hello to {{ name }} and ask how you can help them today.
`.trimStart();

const TONE_INCLUDE = `---
id: shared.tone
schema_version: 1
---

# System instructions

Always be polite, professional, and concise. Avoid jargon unless the user uses it first.
`.trimStart();

const TEST_SIDECAR = `cases:
  - name: basic-greeting
    variables:
      name: "World"
      app_context: "Welcome screen"
  - name: named-greeting
    variables:
      name: "Alice"
      app_context: "Settings page"
`;

export async function init(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const dir = args.find((a) => !a.startsWith('--')) ?? './prompts';

  const files: Array<{ path: string; content: string }> = [
    { path: join(dir, 'hello.md'), content: HELLO_PROMPT },
    { path: join(dir, 'hello.test.yaml'), content: TEST_SIDECAR },
    { path: join(dir, 'shared', 'tone.md'), content: TONE_INCLUDE },
  ];

  let created = 0;
  let skipped = 0;

  for (const file of files) {
    if (existsSync(file.path)) {
      console.log(`  skip ${file.path} (already exists)`);
      skipped++;
      continue;
    }
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content, 'utf-8');
    console.log(`  ✓ ${file.path}`);
    created++;
  }

  console.log();
  console.log(`Created ${created} file(s), skipped ${skipped} existing.`);

  // Suggest build script if package.json exists
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
      if (!pkg.scripts?.['build:prompts']) {
        console.log();
        console.log(`Tip: Add to your package.json scripts:`);
        console.log(`  "build:prompts": "promptopskit compile ${dir} ./dist/prompts"`);
      }
    } catch {
      // Ignore parse errors
    }
  }
}
