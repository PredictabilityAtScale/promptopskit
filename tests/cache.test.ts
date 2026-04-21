import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PromptCache } from '../src/cache.js';

describe('PromptCache', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pok-cache-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('evicts the least recently used entry', async () => {
    const fileA = join(tmpDir, 'a.md');
    const fileB = join(tmpDir, 'b.md');
    const fileC = join(tmpDir, 'c.md');

    await writeFile(fileA, 'A');
    await writeFile(fileB, 'B');
    await writeFile(fileC, 'C');

    const cache = new PromptCache<string>(2);
    cache.set(fileA, 'asset-a');
    cache.set(fileB, 'asset-b');

    expect(cache.get(fileA)).toBe('asset-a');

    cache.set(fileC, 'asset-c');

    expect(cache.get(fileA)).toBe('asset-a');
    expect(cache.get(fileB)).toBeUndefined();
    expect(cache.get(fileC)).toBe('asset-c');
  });
});