import { build } from 'bun';

console.log('Building...');

await build({
  entrypoints: ['./index.ts'],
  format: 'esm',
  outdir: './out',
  target: 'bun',
});
