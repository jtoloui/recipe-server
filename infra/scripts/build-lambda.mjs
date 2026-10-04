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

console.log('▶ installing prod deps in lambda-dist (linux arm64 binaries)…');
// The Lambda runs on Graviton (linux/arm64, glibc) while CI builds on x64 —
// select the matching native optional deps (e.g. sharp's @img/sharp-linux-arm64).
run(
  'npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --os=linux --cpu=arm64 --libc=glibc',
  out
);
if (!existsSync(path.join(out, 'node_modules', '@img', 'sharp-linux-arm64'))) {
  throw new Error('sharp linux-arm64 binary missing from lambda-dist');
}

console.log('▶ adding LWA run.sh…');
cpSync(path.join(infra, 'lambda', 'run.sh'), path.join(out, 'run.sh'));
chmodSync(path.join(out, 'run.sh'), 0o755);

console.log('✅ lambda-dist ready:', out);

// Cognito custom email sender Lambda: its asset is infra/lambda-email as-is,
// so its node_modules must be installed before `cdk deploy` packages it.
// (Missing deps here = Runtime.ImportModuleError = no signup/reset emails.)
const emailDir = path.join(infra, 'lambda-email');
console.log('▶ installing email-sender Lambda deps…');
run('npm ci --omit=dev --no-audit --no-fund', emailDir);
if (!existsSync(path.join(emailDir, 'node_modules', '@aws-crypto', 'client-node'))) {
  throw new Error('email sender deps missing (@aws-crypto/client-node)');
}
console.log('✅ lambda-email ready');
