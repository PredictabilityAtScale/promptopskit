import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../src/cli/commands/init.js';
import { render } from '../src/cli/commands/render.js';
import { inspect } from '../src/cli/commands/inspect.js';
import { compile } from '../src/cli/commands/compile.js';
import { skill } from '../src/cli/commands/skill.js';
import { validate } from '../src/cli/commands/validate.js';

describe('CLI defaults inheritance', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-cli-'));
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
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

  it('render accepts option values before the file argument', async () => {
    await mkdir(join(tmpDir, 'prompts', 'support'), { recursive: true });

    await writeFile(join(tmpDir, 'prompts', 'support', 'reply.md'), `---
id: support/reply
schema_version: 1
environments:
  dev:
    model: gpt-5.4-mini
---

# Prompt template

Hello.
`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await render([
      '--env',
      'dev',
      join(tmpDir, 'prompts', 'support', 'reply.md'),
      '--json',
    ]);

    const output = logSpy.mock.calls[0]?.[0];
    expect(typeof output).toBe('string');

    const parsed = JSON.parse(output as string) as Record<string, unknown>;
    expect(parsed.id).toBe('support/reply');
    expect(parsed.model).toBe('gpt-5.4-mini');
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

  it('compile fails early on invalid context regex definitions', async () => {
    await mkdir(join(tmpDir, 'prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'prompts', 'invalid.md'), `---
id: invalid.regex
schema_version: 1
context:
  inputs:
    - name: pull_request_body
      deny_regex: "/secret/z"
---

# Prompt template

{{ pull_request_body }}
`);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never;

    await expect(compile([join(tmpDir, 'prompts')])).rejects.toThrow('process.exit:1');
    expect(errorSpy.mock.calls.flat().join('\n')).toContain('POK013: Invalid context regex for prompt "invalid.regex"');

    exitSpy.mockRestore();
  });

  it('validate reports double-quoted context regex YAML escapes with a PromptOpsKit error', async () => {
    await mkdir(join(tmpDir, 'prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'prompts', 'invalid-yaml-regex.md'), `---
id: invalid.yaml.regex
schema_version: 1
context:
  inputs:
    - name: user_message
      deny_regex:
        pattern: "(?:ignore|forget)\\s+instructions|(?:^|\\b)system\\s*:"
---

# Prompt template

{{ user_message }}
`);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never;

    await expect(validate([join(tmpDir, 'prompts')])).rejects.toThrow('process.exit:1');

    const output = errorSpy.mock.calls.flat().join('\n');
    expect(output).toContain('POK013: Invalid context regex YAML');
    expect(output).toContain('Use unquoted /pattern/i literal form');

    exitSpy.mockRestore();
  });

  it('validate accepts --source and validates that directory', async () => {
    await mkdir(join(tmpDir, 'custom-prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'custom-prompts', 'hello.md'), `---
id: hello
schema_version: 1
---

# Prompt template

Hello.
`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await validate(['--source', join(tmpDir, 'custom-prompts')]);

    expect(logSpy.mock.calls.flat().join('\n')).toContain('Validated 1 file(s): 0 error(s), 0 warning(s)');
  });

  it('validate defaults to ./prompts when no source directory is provided', async () => {
    await mkdir(join(tmpDir, 'prompts'), { recursive: true });
    await writeFile(join(tmpDir, 'prompts', 'hello.md'), `---
id: hello
schema_version: 1
---

# Prompt template

Hello.
`);

    process.chdir(tmpDir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await validate([]);

    expect(logSpy.mock.calls.flat().join('\n')).toContain('Validated 1 file(s): 0 error(s), 0 warning(s)');
  });

  it('init scaffolds the default prompts directory inside the current working directory', async () => {
    process.chdir(tmpDir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await init([]);

    expect(existsSync(join(tmpDir, 'prompts', 'defaults.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'prompts', 'hello.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'prompts', 'hello.test.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'prompts', 'shared', 'tone.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'prompts', 'example-usage.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'tests', 'hello.prompt.test.mjs'))).toBe(true);

    const helloPrompt = await readFile(join(tmpDir, 'prompts', 'hello.md'), 'utf-8');
    const helloSidecar = await readFile(join(tmpDir, 'prompts', 'hello.test.yaml'), 'utf-8');
    const helloTest = await readFile(join(tmpDir, 'tests', 'hello.prompt.test.mjs'), 'utf-8');
    expect(helloPrompt).toContain('id: hello');
    expect(helloSidecar).toContain('response:');
    expect(helloTest).toContain('getHardcodedPromptResponse');
    expect(helloTest).toContain("node:test");
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Created 6 file(s), skipped 0 existing.');
  });

  it('init skips existing files in a custom directory', async () => {
    const promptsDir = join(tmpDir, 'custom-prompts');
    await mkdir(promptsDir, { recursive: true });
    await writeFile(join(promptsDir, 'hello.md'), 'existing hello', 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await init([promptsDir]);

    expect(await readFile(join(promptsDir, 'hello.md'), 'utf-8')).toBe('existing hello');
    expect(existsSync(join(promptsDir, 'defaults.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'shared', 'tone.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'tests', 'hello.prompt.test.mjs'))).toBe(true);
    expect(logSpy.mock.calls.flat().join('\n')).toContain(`skip ${join(promptsDir, 'hello.md')} (already exists)`);
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Created 5 file(s), skipped 1 existing.');
  });

  it('skill creates all supported target files by default', async () => {
    process.chdir(tmpDir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await skill([]);

    expect(existsSync(join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.github', 'instructions', 'promptopskit.instructions.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.cursor', 'rules', 'promptopskit.mdc'))).toBe(true);

    const agents = await readFile(join(tmpDir, 'AGENTS.md'), 'utf-8');
    const claude = await readFile(join(tmpDir, 'CLAUDE.md'), 'utf-8');
    const copilot = await readFile(join(tmpDir, '.github', 'instructions', 'promptopskit.instructions.md'), 'utf-8');
    expect(agents).toContain('<!-- promptopskit:start -->');
    expect(claude.trim()).toBe('@AGENTS.md');
    expect(copilot).toContain('applyTo: "**"');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('AI agents will now understand how to create and manage prompts with promptopskit.');
  });

  it('skill merges into an existing target file without overwriting surrounding content', async () => {
    process.chdir(tmpDir);
    await writeFile(join(tmpDir, 'AGENTS.md'), '# Existing\n\nTeam instructions.\n', 'utf-8');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await skill(['--target', 'agents']);

    const content = await readFile(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# Existing');
    expect(content).toContain('Team instructions.');
    expect(content).toContain('<!-- promptopskit:start -->');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('✓ AGENTS.md (merged)');
  });

  it('skill force-overwrites a targeted file', async () => {
    process.chdir(tmpDir);
    await writeFile(join(tmpDir, 'AGENTS.md'), '# Existing\n\nTeam instructions.\n', 'utf-8');

    await skill(['--target', 'agents', '--force']);

    const content = await readFile(join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(content).not.toContain('Team instructions.');
    expect(content).toContain('<!-- promptopskit:start -->');
    expect(content).toContain('# promptopskit');
  });
});
