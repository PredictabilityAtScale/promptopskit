import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, unlink, utimes, writeFile } from 'node:fs/promises';
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

  it('invalidates an entry when the file mtime changes', async () => {
    const file = join(tmpDir, 'changed.md');
    await writeFile(file, 'original');

    const cache = new PromptCache<string>(2);
    cache.set(file, 'asset');

    expect(cache.get(file)).toBe('asset');

    const future = new Date(Date.now() + 10_000);
    await utimes(file, future, future);

    expect(cache.get(file)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('invalidates an entry when the file is deleted', async () => {
    const file = join(tmpDir, 'deleted.md');
    await writeFile(file, 'content');

    const cache = new PromptCache<string>(2);
    cache.set(file, 'asset');

    await unlink(file);

    expect(cache.get(file)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('clears all entries', async () => {
    const fileA = join(tmpDir, 'clear-a.md');
    const fileB = join(tmpDir, 'clear-b.md');

    await writeFile(fileA, 'A');
    await writeFile(fileB, 'B');

    const cache = new PromptCache<string>(2);
    cache.set(fileA, 'asset-a');
    cache.set(fileB, 'asset-b');

    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get(fileA)).toBeUndefined();
    expect(cache.get(fileB)).toBeUndefined();
  });
});
