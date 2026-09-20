#!/usr/bin/env node
/**
 * Stage the recipe-server into `infra/lambda-dist/` for the Lambda asset:
 *   1. build the server (tsc → ../dist)
 *   2. copy dist/ + package.json + package-lock.json
 *   3. install PROD-only node_modules in the staged dir
 *   4. drop in run.sh (LWA entrypoint), chmod +x
 *
 * Kept dependency-free (Node built-ins + child_process) so it runs anywhere.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const infra = path.resolve(here, '..');
const server = path.resolve(infra, '..');
const out = path.join(infra, 'lambda-dist');

const run = (cmd, cwd) =>
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });

console.log('▶ building server (tsc)…');
run('npm run build', server);

console.log('▶ staging lambda-dist…');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(server, 'dist'), path.join(out, 'dist'), { recursive: true });
cpSync(path.join(server, 'package.json'), path.join(out, 'package.json'));
if (existsSync(path.join(server, 'package-lock.json'))) {
  cpSync(
    path.join(server, 'package-lock.json'),
    path.join(out, 'package-lock.json')
  );
}

console.log('▶ installing prod deps in lambda-dist…');
run('npm install --omit=dev --legacy-peer-deps --no-audit --no-fund', out);

console.log('▶ adding LWA run.sh…');
cpSync(path.join(infra, 'lambda', 'run.sh'), path.join(out, 'run.sh'));
chmodSync(path.join(out, 'run.sh'), 0o755);

console.log('✅ lambda-dist ready:', out);
