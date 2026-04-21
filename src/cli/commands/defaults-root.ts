import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function findDefaultsRoot(filePath: string): string {
  let current = resolve(dirname(filePath));
  let root = current;
  let foundDefaults = false;

  while (true) {
    if (existsSync(join(current, 'defaults.md'))) {
      root = current;
      foundDefaults = true;
    } else if (foundDefaults) {
      return root;
    }

    const parent = dirname(current);
    if (parent === current) {
      return root;
    }

    current = parent;
  }
}