import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveIncludes } from '../src/composition/index.js';
import { parsePrompt } from '../src/parser/index.js';
import { validateAsset, validateAssetWithIncludes } from '../src/validation/index.js';

// --- resolve-includes ---

describe('resolveIncludes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('inlines system instructions from an included file', async () => {
    await mkdir(join(tmpDir, 'shared'), { recursive: true });
    await writeFile(join(tmpDir, 'shared', 'tone.md'), `---
id: shared/tone
schema_version: 1
---

# System instructions

Be polite and concise.
`);
    await writeFile(join(tmpDir, 'main.md'), `---
id: main
schema_version: 1
includes:
  - ./shared/tone.md
---

# System instructions

Handle requests carefully.

# Prompt template

{{ message }}
`);

    const content = await readFile(join(tmpDir, 'main.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'main.md'));
    const resolved = await resolveIncludes(asset, join(tmpDir, 'main.md'));

    expect(resolved.includes).toBeUndefined();
    expect(resolved.sections?.system_instructions).toContain('Be polite and concise.');
    expect(resolved.sections?.system_instructions).toContain('Handle requests carefully.');
    // Included instructions come first
    const politeIdx = resolved.sections!.system_instructions!.indexOf('Be polite');
    const handleIdx = resolved.sections!.system_instructions!.indexOf('Handle requests');
    expect(politeIdx).toBeLessThan(handleIdx);
  });

  it('resolves nested includes recursively', async () => {
    await mkdir(join(tmpDir, 'shared'), { recursive: true });
    await writeFile(join(tmpDir, 'shared', 'base.md'), `---
id: shared.base
schema_version: 1
---

# System instructions

Base policy.
`);
    await writeFile(join(tmpDir, 'shared', 'mid.md'), `---
id: shared.mid
schema_version: 1
includes:
  - ./base.md
---

# System instructions

Mid-level rules.
`);
    await writeFile(join(tmpDir, 'main.md'), `---
id: main
schema_version: 1
includes:
  - ./shared/mid.md
---

# Prompt template

Hello.
`);

    const content = await readFile(join(tmpDir, 'main.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'main.md'));
    const resolved = await resolveIncludes(asset, join(tmpDir, 'main.md'));

    expect(resolved.sections?.system_instructions).toContain('Base policy.');
    expect(resolved.sections?.system_instructions).toContain('Mid-level rules.');
  });

  it('detects circular includes', async () => {
    await writeFile(join(tmpDir, 'a.md'), `---
id: a
schema_version: 1
includes:
  - ./b.md
---

# Prompt template

A
`);
    await writeFile(join(tmpDir, 'b.md'), `---
id: b
schema_version: 1
includes:
  - ./a.md
---

# Prompt template

B
`);

    const content = await readFile(join(tmpDir, 'a.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'a.md'));

    await expect(resolveIncludes(asset, join(tmpDir, 'a.md'))).rejects.toThrow(
      /Circular include/,
    );
  });

  it('throws on missing include file', async () => {
    await writeFile(join(tmpDir, 'main.md'), `---
id: main
schema_version: 1
includes:
  - ./nonexistent.md
---

# Prompt template

Hello.
`);

    const content = await readFile(join(tmpDir, 'main.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'main.md'));

    await expect(resolveIncludes(asset, join(tmpDir, 'main.md'))).rejects.toThrow();
  });
});

// --- validateAssetWithIncludes ---

describe('validateAssetWithIncludes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-val-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('passes for a prompt with valid includes', async () => {
    await mkdir(join(tmpDir, 'shared'), { recursive: true });
    await writeFile(join(tmpDir, 'shared', 'tone.md'), `---
id: shared/tone
schema_version: 1
---

# System instructions

Be nice.
`);
    await writeFile(join(tmpDir, 'main.md'), `---
id: main
schema_version: 1
includes:
  - ./shared/tone.md
---

# Prompt template

Hello.
`);

    const content = await readFile(join(tmpDir, 'main.md'), 'utf-8');
    const { asset, raw } = parsePrompt(content, join(tmpDir, 'main.md'));
    const result = await validateAssetWithIncludes(
      asset,
      join(tmpDir, 'main.md'),
      Object.keys(raw.frontMatter),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports POK020 for missing include file', async () => {
    await writeFile(join(tmpDir, 'main.md'), `---
id: main
schema_version: 1
includes:
  - ./missing.md
---

# Prompt template

Hello.
`);

    const content = await readFile(join(tmpDir, 'main.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'main.md'));
    const result = await validateAssetWithIncludes(asset, join(tmpDir, 'main.md'));

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'POK020')).toBe(true);
  });

  it('reports POK021 for circular includes', async () => {
    await writeFile(join(tmpDir, 'a.md'), `---
id: a
schema_version: 1
includes:
  - ./b.md
---

# Prompt template

A
`);
    await writeFile(join(tmpDir, 'b.md'), `---
id: b
schema_version: 1
includes:
  - ./a.md
---

# Prompt template

B
`);

    const content = await readFile(join(tmpDir, 'a.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'a.md'));
    const result = await validateAssetWithIncludes(asset, join(tmpDir, 'a.md'));

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'POK021')).toBe(true);
  });

  it('still reports standard validation errors alongside include errors', async () => {
    await writeFile(join(tmpDir, 'bad.md'), `---
id: bad
schema_version: 1
includes:
  - ./missing.md
---
`);

    const content = await readFile(join(tmpDir, 'bad.md'), 'utf-8');
    const { asset } = parsePrompt(content, join(tmpDir, 'bad.md'));
    const result = await validateAssetWithIncludes(asset, join(tmpDir, 'bad.md'));

    expect(result.valid).toBe(false);
    // POK003: missing body sections
    expect(result.errors.some((e) => e.code === 'POK003')).toBe(true);
    // POK020: missing include
    expect(result.errors.some((e) => e.code === 'POK020')).toBe(true);
  });
});

// --- compile resolves includes ---

describe('compile resolves includes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-compile-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('compiled JSON includes inlined system instructions', async () => {
    // Set up source prompts
    const srcDir = join(tmpDir, 'src');
    const outDir = join(tmpDir, 'out');
    await mkdir(join(srcDir, 'shared'), { recursive: true });

    await writeFile(join(srcDir, 'shared', 'tone.md'), `---
id: shared/tone
schema_version: 1
---

# System instructions

Always be polite.
`);
    await writeFile(join(srcDir, 'main.md'), `---
id: main
schema_version: 1
provider: openai
model: gpt-5.4
includes:
  - ./shared/tone.md
---

# System instructions

You are a support agent.

# Prompt template

{{ message }}
`);

    // Import compile dynamically to call it
    const { compile } = await import('../src/cli/commands/compile.js');
    await compile([srcDir, outDir]);

    // Read the compiled artifact
    const compiled = JSON.parse(await readFile(join(outDir, 'main.json'), 'utf-8'));

    // Includes should be inlined and removed
    expect(compiled.includes).toBeUndefined();
    expect(compiled.sections.system_instructions).toContain('Always be polite.');
    expect(compiled.sections.system_instructions).toContain('You are a support agent.');
  });

  it('compiled JSON for prompt without includes is unchanged', async () => {
    const srcDir = join(tmpDir, 'src');
    const outDir = join(tmpDir, 'out');
    await mkdir(srcDir, { recursive: true });

    await writeFile(join(srcDir, 'simple.md'), `---
id: simple
schema_version: 1
---

# Prompt template

Hello.
`);

    const { compile } = await import('../src/cli/commands/compile.js');
    await compile([srcDir, outDir]);

    const compiled = JSON.parse(await readFile(join(outDir, 'simple.json'), 'utf-8'));
    expect(compiled.sections.prompt_template).toBe('Hello.');
  });
});
