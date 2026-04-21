import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { render } from '../src/cli/commands/render.js';
import { inspect } from '../src/cli/commands/inspect.js';

describe('CLI defaults inheritance', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-cli-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('render inherits ancestor defaults.md for nested prompts', async () => {
    await mkdir(join(tmpDir, 'prompts', 'support'), { recursive: true });

    await writeFile(join(tmpDir, 'prompts', 'defaults.md'), `---
provider: openai
model: gpt-5.4
---

# System instructions

Root defaults.
`);

    await writeFile(join(tmpDir, 'prompts', 'support', 'reply.md'), `---
id: support/reply
schema_version: 1
context:
  inputs:
    - user_message
---

# Prompt template

{{ user_message }}
`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await render([
      join(tmpDir, 'prompts', 'support', 'reply.md'),
      '--json',
    ]);

    const output = logSpy.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output as string) as Record<string, unknown>;
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-5.4');
    expect(parsed.system_instructions).toBe('Root defaults.');
    expect(parsed.prompt_template).toBe('{{ user_message }}');
  });

  it('render inherits defaults across multiple nested directories without intermediate defaults files', async () => {
    await mkdir(join(tmpDir, 'prompts', 'support', 'deep'), { recursive: true });

    await writeFile(join(tmpDir, 'prompts', 'defaults.md'), `---
provider: openai
model: gpt-5.4
---

# System instructions

Root defaults.
`);

    await writeFile(join(tmpDir, 'prompts', 'support', 'deep', 'reply.md'), `---
id: support/deep/reply
schema_version: 1
---

# Prompt template

Hello.
`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await render([
      join(tmpDir, 'prompts', 'support', 'deep', 'reply.md'),
      '--json',
    ]);

    const output = logSpy.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output as string) as Record<string, unknown>;
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-5.4');
    expect(parsed.system_instructions).toBe('Root defaults.');
  });

  it('inspect inherits ancestor defaults.md for nested prompts', async () => {
    await mkdir(join(tmpDir, 'prompts', 'support'), { recursive: true });

    await writeFile(join(tmpDir, 'prompts', 'defaults.md'), `---
provider: openai
model: gpt-5.4
metadata:
  owner: docs-team
---

# System instructions

Root defaults.
`);

    await writeFile(join(tmpDir, 'prompts', 'support', 'reply.md'), `---
id: support/reply
schema_version: 1
---

# Prompt template

Hello.
`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await inspect([
      join(tmpDir, 'prompts', 'support', 'reply.md'),
    ]);

    const output = logSpy.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output as string) as Record<string, unknown>;
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-5.4');
    expect(parsed.metadata).toEqual({ owner: 'docs-team' });
    expect((parsed.sections as Record<string, unknown>).system_instructions).toBe('Root defaults.');
  });

  it('inspect inherits defaults across multiple nested directories without intermediate defaults files', async () => {
    await mkdir(join(tmpDir, 'prompts', 'support', 'deep'), { recursive: true });

    await writeFile(join(tmpDir, 'prompts', 'defaults.md'), `---
provider: openai
model: gpt-5.4
metadata:
  owner: docs-team
---

# System instructions

Root defaults.
`);

    await writeFile(join(tmpDir, 'prompts', 'support', 'deep', 'reply.md'), `---
id: support/deep/reply
schema_version: 1
---

# Prompt template

Hello.
`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await inspect([
      join(tmpDir, 'prompts', 'support', 'deep', 'reply.md'),
    ]);

    const output = logSpy.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output as string) as Record<string, unknown>;
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-5.4');
    expect(parsed.metadata).toEqual({ owner: 'docs-team' });
    expect((parsed.sections as Record<string, unknown>).system_instructions).toBe('Root defaults.');
  });
});