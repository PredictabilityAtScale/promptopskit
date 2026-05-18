import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { PromptAsset } from '../schema/index.js';

const SUPPORTED_SCHEMA_REF_EXTENSIONS = new Set(['.json', '.js', '.mjs', '.cjs']);


async function resolveJsonSchemaRef(schemaRef: string, promptFilePath: string): Promise<{ schema: Record<string, unknown>; resolvedPath: string; hash: string }> {
  const resolvedPath = resolve(dirname(promptFilePath), schemaRef);
  let raw: string;

  try {
    raw = await readFile(resolvedPath, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`POK050: response.schema_ref "${schemaRef}" not found (resolved from ${promptFilePath})`);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`POK050: response.schema_ref "${schemaRef}" is not valid JSON`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`POK050: response.schema_ref "${schemaRef}" must resolve to a JSON object schema`);
  }

  return {
    schema: parsed as Record<string, unknown>,
    resolvedPath,
    hash: createHash('sha256').update(raw).digest('hex'),
  };
}

async function resolveZodSchemaRef(schemaRef: string, promptFilePath: string): Promise<{ schema: Record<string, unknown>; resolvedPath: string; hash: string }> {
  const resolvedPath = resolve(dirname(promptFilePath), schemaRef);

  let moduleSource: string;
  try {
    moduleSource = await readFile(resolvedPath, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`POK051: response.schema_ref "${schemaRef}" not found (resolved from ${promptFilePath})`);
    }
    throw error;
  }

  let imported: unknown;
  try {
    imported = await import(pathToFileURL(resolvedPath).href);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`POK051: response.schema_ref "${schemaRef}" could not be imported as a module (${message})`);
  }

  const mod = imported as Record<string, unknown>;
  const candidate = mod.default ?? mod.schema;

  if (!(candidate instanceof z.ZodType)) {
    throw new Error('POK051: zod schema modules must export a Zod schema as default export or named export "schema"');
  }

  const jsonSchema = zodToJsonSchema(candidate, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });

  if (!jsonSchema || typeof jsonSchema !== 'object' || Array.isArray(jsonSchema)) {
    throw new Error(`POK051: response.schema_ref "${schemaRef}" did not produce a valid JSON schema object`);
  }

  return {
    schema: jsonSchema as Record<string, unknown>,
    resolvedPath,
    hash: createHash('sha256').update(moduleSource).digest('hex'),
  };
}

export async function resolveResponseSchemaRef(asset: PromptAsset, promptFilePath: string): Promise<PromptAsset> {
  const schemaRef = asset.response?.schema_ref;
  if (!schemaRef) return asset;

  const ext = extname(schemaRef).toLowerCase();
  if (!SUPPORTED_SCHEMA_REF_EXTENSIONS.has(ext)) {
    throw new Error(`POK051: response.schema_ref "${schemaRef}" has unsupported extension "${ext}". Use .json, .js, .mjs, or .cjs`);
  }

  const resolved = (ext === '.json')
    ? await resolveJsonSchemaRef(schemaRef, promptFilePath)
    : await resolveZodSchemaRef(schemaRef, promptFilePath);

  return {
    ...asset,
    response: {
      ...asset.response,
      schema: resolved.schema,
      schema_ref: undefined,
      schema_source: {
        mode: ext === '.json' ? 'schema_ref_json' : 'schema_ref_zod_module',
        ref: schemaRef,
        resolved_path: resolved.resolvedPath,
        hash: resolved.hash,
      },
    },
  };
}
