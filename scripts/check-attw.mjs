import { execFileSync } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import * as core from '@arethetypeswrong/core';
import { getExitCode } from '@arethetypeswrong/cli/internal/getExitCode';
import * as render from '@arethetypeswrong/cli/internal/render';

const opts = {
  color: process.env.NO_COLOR ? false : undefined,
  emoji: true,
  format: 'auto',
  ignoreRules: ['no-resolution'],
  summary: true,
};

let tarball;

try {
  const npmCache = process.env.ATTW_NPM_CACHE ?? join(process.cwd(), '.npm-cache');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const packOutput = execFileSync(npmCommand, ['pack', '--json', '--cache', npmCache], {
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      NPM_CONFIG_CACHE: npmCache,
    },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [packedPackage] = JSON.parse(packOutput);
  tarball = packedPackage.filename;

  const data = new Uint8Array(await readFile(tarball));
  const pkg = core.createPackageFromTarballData(data);
  const analysis = await core.checkPackage(pkg, {});

  if (analysis.types) {
    console.log(await render.typed(analysis, opts));
  } else {
    console.log(render.untyped(analysis));
  }

  const exitCode = getExitCode(analysis, opts);
  if (exitCode) {
    process.exitCode = exitCode;
  }
} finally {
  if (tarball) {
    await unlink(tarball).catch(() => {});
  }
}
