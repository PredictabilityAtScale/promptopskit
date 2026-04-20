import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPromptFile } from '../src/parser/index.js';

describe('defaults.md inheritance', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-defaults-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('applies folder defaults when a prompt omits metadata and system instructions', async () => {
    await writeFile(join(tmpDir, 'defaults.md'), `---
metadata:
  owner: platform-team
  review_required: true
---

# System instructions

Follow the global policy.
`);

    await writeFile(join(tmpDir, 'hello.md'), `---
id: hello
schema_version: 1
---

# Prompt template

Hello {{ name }}.
`);

    const { asset } = await loadPromptFile(join(tmpDir, 'hello.md'), { defaultsRoot: tmpDir });

    expect(asset.metadata?.owner).toBe('platform-team');
    expect(asset.metadata?.review_required).toBe(true);
    expect(asset.sections?.system_instructions).toBe('Follow the global policy.');
  });

  it('uses nearest defaults.md and keeps explicit prompt values', async () => {
    await writeFile(join(tmpDir, 'defaults.md'), `---
metadata:
  owner: root-team
---

# System instructions

Root defaults.
`);

    await mkdir(join(tmpDir, 'support'), { recursive: true });
    await writeFile(join(tmpDir, 'support', 'defaults.md'), `---
metadata:
  owner: support-team
  stable: true
---

# System instructions

Support defaults.
`);

    await writeFile(join(tmpDir, 'support', 'reply.md'), `---
id: support.reply
schema_version: 1
metadata:
  review_required: false
---

# Prompt template

{{ user_message }}
`);

    const { asset } = await loadPromptFile(join(tmpDir, 'support', 'reply.md'), { defaultsRoot: tmpDir });

    expect(asset.metadata).toEqual({
      owner: 'support-team',
      stable: true,
      review_required: false,
    });
    expect(asset.sections?.system_instructions).toBe('Support defaults.');
  });

  it('returns unchanged asset when no defaults.md exists', async () => {
    await writeFile(join(tmpDir, 'hello.md'), `---
id: hello
schema_version: 1
---

# Prompt template

Hello {{ name }}.
`);

    const { asset } = await loadPromptFile(join(tmpDir, 'hello.md'), { defaultsRoot: tmpDir });

    expect(asset.metadata).toBeUndefined();
    expect(asset.sections?.system_instructions).toBeUndefined();
    expect(asset.sections?.prompt_template).toBe('Hello {{ name }}.');
  });

  it('stops traversal at defaultsRoot boundary', async () => {
    // Place a defaults.md ABOVE the root — it should be ignored
    await writeFile(join(tmpDir, 'defaults.md'), `---
metadata:
  owner: parent-should-be-ignored
---
`);

    const subDir = join(tmpDir, 'prompts');
    await mkdir(subDir, { recursive: true });

    await writeFile(join(subDir, 'hello.md'), `---
id: hello
schema_version: 1
---

# Prompt template

Hello.
`);

    const { asset } = await loadPromptFile(join(subDir, 'hello.md'), { defaultsRoot: subDir });

    // The parent defaults.md is above defaultsRoot, should not be picked up
    expect(asset.metadata).toBeUndefined();
  });

  it('does not apply defaults to included files', async () => {
    await writeFile(join(tmpDir, 'defaults.md'), `---
metadata:
  owner: platform
---

# System instructions

Global default instructions.
`);

    await mkdir(join(tmpDir, 'shared'), { recursive: true });
    await writeFile(join(tmpDir, 'shared', 'tone.md'), `---
id: shared.tone
schema_version: 1
---

# System instructions

Be polite and concise.
`);

    await writeFile(join(tmpDir, 'hello.md'), `---
id: hello
schema_version: 1
includes:
  - ./shared/tone.md
---

# Prompt template

Hello {{ name }}.
`);

    const { resolveIncludes } = await import('../src/composition/index.js');
    const { asset: parsed } = await loadPromptFile(join(tmpDir, 'hello.md'), { defaultsRoot: tmpDir });
    const resolved = await resolveIncludes(parsed, join(tmpDir, 'hello.md'));

    // System instructions should be: included tone + default (from the prompt's own defaults)
    // but the included file itself should NOT have had defaults applied,
    // so we should see exactly the tone instructions, not doubled global defaults.
    expect(resolved.sections?.system_instructions).toBe(
      'Be polite and concise.\n\nGlobal default instructions.'
    );
  });
});
