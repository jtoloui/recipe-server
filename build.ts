import { build } from 'bun';
import { log } from 'git-rev-sync';

console.log('Building...');

try {
  const buildRes = await build({
    entrypoints: ['./index.ts'],
    format: 'esm',
    outdir: './out',
    target: 'bun',
  });

  console.log('Build complete');
} catch (error) {
  console.error('Build failed', error);
}
