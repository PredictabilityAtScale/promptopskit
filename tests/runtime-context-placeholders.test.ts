import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPromptOpsKit } from '../src/index.js';

describe('runtime context placeholders across modes', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-context-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('renders {{ key }} placeholders in source-only mode with dev overrides', async () => {
    const sourceDir = join(tmpDir, 'prompts');
    await mkdir(sourceDir, { recursive: true });

    await writeFile(join(sourceDir, 'context-aware.md'), `---
id: context.aware
schema_version: 1
provider: openai
model: gpt-5.4
environments:
  dev:
    model: gpt-5.4-mini
context:
  inputs:
    - app_context
---

# System instructions

You are helping inside {{ app_context }}.

# Prompt template

User is currently in {{ app_context }}.
`);

    const kit = createPromptOpsKit({ sourceDir, mode: 'source-only', cache: false });
    const result = await kit.renderPrompt({
      path: 'context-aware',
      provider: 'openai',
      environment: 'dev',
      variables: { app_context: 'Billing settings' },
    });

    expect(result.request.model).toBe('gpt-5.4-mini');
    const messages = result.request.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain('Billing settings');
    expect(messages[1].content).toContain('Billing settings');
  });

  it('renders {{ key }} placeholders in compiled-only mode with prod overrides', async () => {
    const sourceDir = join(tmpDir, 'prompts');
    const compiledDir = join(tmpDir, 'dist');
    await mkdir(sourceDir, { recursive: true });
    await mkdir(compiledDir, { recursive: true });

    await writeFile(join(compiledDir, 'context-aware.json'), JSON.stringify({
      id: 'context.aware',
      schema_version: 1,
      provider: 'openai',
      model: 'gpt-5.4-mini',
      environments: {
        prod: { model: 'gpt-5.4' },
      },
      context: { inputs: ['app_context'] },
      sections: {
        system_instructions: 'You are helping inside {{ app_context }}.',
        prompt_template: 'User is currently in {{ app_context }}.',
      },
    }));

    const kit = createPromptOpsKit({
      sourceDir,
      compiledDir,
      mode: 'compiled-only',
      cache: false,
    });

    const result = await kit.renderPrompt({
      path: 'context-aware',
      provider: 'openai',
      environment: 'prod',
      variables: { app_context: 'Team dashboard' },
    });

    expect(result.request.model).toBe('gpt-5.4');
    const messages = result.request.body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain('Team dashboard');
    expect(messages[1].content).toContain('Team dashboard');
  });
});
