import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveResponseSchemaRef } from '../src/parser/response-schema-ref.js';

const zodUrl = import.meta.resolve('zod');
const zodCjsPath = createRequire(import.meta.url).resolve('zod');

describe('Zod response schema references', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pok-zod-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function resolveModule(source: string, extension = '.mjs') {
    const name = `reply.schema${extension}`;
    const modulePath = join(directory, name);
    await writeFile(modulePath, source);
    return resolveResponseSchemaRef({
      id: 'zod-migration',
      schema_version: 1,
      response: { schema_ref: `./${name}` },
    }, join(directory, 'reply.md'));
  }

  it('preserves constraints, optional defaults, transforms, and inline reuse in draft 7', async () => {
    const asset = await resolveModule(`
      import { z } from ${JSON.stringify(zodUrl)};
      const answer = z.string().min(1).describe('Answer text');
      export default z.object({
        answer,
        summary: answer,
        confidence: z.number().min(0).max(1),
        label: z.string().optional(),
        status: z.string().default('ok'),
        length: z.string().transform(value => value.length),
        details: z.object({ count: z.number().int().positive() }),
      });
    `);

    expect(asset.response?.schema).toMatchObject({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'summary', 'confidence', 'length', 'details'],
      properties: {
        answer: { type: 'string', minLength: 1, description: 'Answer text' },
        summary: { type: 'string', minLength: 1, description: 'Answer text' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        label: { type: 'string' },
        status: { type: 'string', default: 'ok' },
        length: { type: 'string' },
        details: {
          type: 'object',
          additionalProperties: false,
          required: ['count'],
          properties: { count: { type: 'integer', exclusiveMinimum: 0 } },
        },
      },
    });
    expect(JSON.stringify(asset.response?.schema)).not.toContain('"$ref"');
    expect(asset.response?.schema_ref).toBeUndefined();
    const modulePath = join(directory, 'reply.schema.mjs');
    expect(asset.response?.schema_source).toEqual({
      mode: 'schema_ref_zod_module',
      ref: './reply.schema.mjs',
      resolved_path: modulePath,
      hash: createHash('sha256').update(await readFile(modulePath)).digest('hex'),
    });
  });

  it('preserves explicit strict, passthrough, catchall, and record schemas', async () => {
    const asset = await resolveModule(`
      import { z } from ${JSON.stringify(zodUrl)};
      export const schema = z.object({
        strict: z.strictObject({ answer: z.string() }),
        loose: z.looseObject({ answer: z.string() }),
        catchall: z.object({}).catchall(z.number()),
        record: z.record(z.string(), z.boolean()),
      });
    `);

    expect(asset.response?.schema).toMatchObject({
      properties: {
        strict: { type: 'object', additionalProperties: false },
        loose: { type: 'object', additionalProperties: {} },
        catchall: { type: 'object', additionalProperties: { type: 'number' } },
        record: { type: 'object', additionalProperties: { type: 'boolean' } },
      },
    });
  });

  it.each(['default', 'named'])('loads a CommonJS %s schema export', async (kind) => {
    const source = `
      const { z } = require(${JSON.stringify(zodCjsPath)});
      ${kind === 'default' ? 'module.exports' : 'exports.schema'} = z.object({ answer: z.string() });
    `;
    const asset = await resolveModule(source, '.cjs');
    expect(asset.response?.schema).toMatchObject({
      type: 'object',
      required: ['answer'],
      properties: { answer: { type: 'string' } },
    });
  });

  it('rejects unsupported types with a schema-reference diagnostic', async () => {
    await expect(resolveModule(`
      import { z } from ${JSON.stringify(zodUrl)};
      export default z.object({ created: z.date() });
    `)).rejects.toThrow('POK051: response.schema_ref "./reply.schema.mjs" could not be converted to JSON Schema');
  });

  it('rejects Zod 3 exports with an actionable version diagnostic', async () => {
    await expect(resolveModule(`
      import { z } from ${JSON.stringify(import.meta.resolve('zod/v3'))};
      export default z.object({ answer: z.string() });
    `)).rejects.toThrow('must export a Zod 4 schema');
  });
});
