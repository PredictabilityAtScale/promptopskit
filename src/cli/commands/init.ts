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
environments:
  dev:
    model: gpt-5.4-mini
    sampling:
      temperature: 0.2
---

# System instructions

You are a friendly assistant. Be helpful and concise.
Current app context: {{ app_context }}.

# Prompt template

Say hello to {{ name }} and ask how you can help them today.
`.trimStart();

const TONE_INCLUDE = `---
id: shared/tone
schema_version: 1
---

# System instructions

Always be polite, professional, and concise. Avoid jargon unless the user uses it first.
`.trimStart();

const DEFAULTS = `---
metadata:
  owner: my-team
  review_required: true
---

# System instructions

You are a helpful AI assistant. Follow company guidelines at all times.
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

const EXAMPLE_USAGE = `// Example: render the hello prompt and send it to OpenAI
// Full docs: https://promptopskit.com/docs/index.html#/

import { createPromptOpsKit } from 'promptopskit';

async function main() {
  const kit = createPromptOpsKit({ sourceDir: './prompts' });

  // Determine environment from ENV var (defaults to 'dev')
  // - dev: uses gpt-5.4-mini with temperature 0.2 (see hello.md environments)
  // - production: uses base model gpt-5.4 with default settings
  const environment = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

  const { request } = await kit.renderPrompt({
    path: 'hello',
    provider: 'openai',
    environment,
    variables: {
      name: 'World',
      app_context: 'Welcome screen',
    },
  });

  console.log('Model:', request.body.model);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`,
    },
    body: JSON.stringify(request.body),
  });

  const data = await res.json();
  console.log(data.choices[0].message.content);
}

main();
`;

export async function init(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const dir = args.find((a) => !a.startsWith('--')) ?? './prompts';

  const files: Array<{ path: string; content: string }> = [
    { path: join(dir, 'defaults.md'), content: DEFAULTS },
    { path: join(dir, 'hello.md'), content: HELLO_PROMPT },
    { path: join(dir, 'hello.test.yaml'), content: TEST_SIDECAR },
    { path: join(dir, 'shared', 'tone.md'), content: TONE_INCLUDE },
    { path: join(dir, 'example-usage.ts'), content: EXAMPLE_USAGE },
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
