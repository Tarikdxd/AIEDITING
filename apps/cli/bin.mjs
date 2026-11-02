#!/usr/bin/env node
// Lightweight shim so `aiediting` runs directly from TypeScript sources (no build step).
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const entry = fileURLToPath(new URL('./src/index.ts', import.meta.url));
let tsxCli;
try {
  tsxCli = join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
} catch {
  tsxCli = null;
}

if (!tsxCli) {
  console.error('aiediting: dev dependency "tsx" is missing; run pnpm install at the repository root');
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? ''},
});
process.exit(result.status ?? 1);
