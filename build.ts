import { build } from 'bun';
import { log } from 'git-rev-sync';

console.log('Building...');

const buildRes = await build({
  entrypoints: ['./index.ts'],
  format: 'esm',
  outdir: './out',
  target: 'bun',
});

console.log('Build complete:', buildRes);
