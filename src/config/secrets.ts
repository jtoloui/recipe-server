import {
  GetParametersCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';

/**
 * Hydrate process.env from SSM Parameter Store SecureString params at cold
 * start, so the existing env-based config keeps working unchanged on Lambda.
 *
 * Cost model (the KeepFlat lesson): SSM Standard SecureString is free (decrypt
 * uses the AWS-managed `aws/ssm` key — no CMK fee). We fetch ONCE per cold
 * start and memoise in module scope, so warm invocations make zero SSM/KMS
 * calls. Skipped entirely when SSM_SECRETS is not set (local dev uses .env).
 *
 * SSM_SECRETS format: comma-separated `ENV_NAME=/ssm/param/name` pairs, e.g.
 *   MONGODB_URI=/justcooking/mongo-uri,SESSION_SECRET=/justcooking/session-secret
 */
let hydrated = false;

const parseMapping = (spec: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const pair of spec.split(',')) {
    const [envName, paramName] = pair.split('=').map((s) => s.trim());
    if (envName && paramName) out[envName] = paramName;
  }
  return out;
};

export const loadSecretsIntoEnv = async (): Promise<void> => {
  if (hydrated) return;

  const spec = process.env.SSM_SECRETS;
  if (!spec) {
    // Local/dev: secrets already come from .env — nothing to do.
    hydrated = true;
    return;
  }

  const mapping = parseMapping(spec);
  const paramNames = Object.values(mapping);
  if (paramNames.length === 0) {
    hydrated = true;
    return;
  }

  const client = new SSMClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  // GetParameters batches up to 10 names in one call (one KMS decrypt burst).
  const chunks: string[][] = [];
  for (let i = 0; i < paramNames.length; i += 10) {
    chunks.push(paramNames.slice(i, i + 10));
  }

  const values: Record<string, string> = {};
  for (const names of chunks) {
    const res = await client.send(
      new GetParametersCommand({ Names: names, WithDecryption: true })
    );
    for (const p of res.Parameters ?? []) {
      if (p.Name && p.Value != null) values[p.Name] = p.Value;
    }
    if (res.InvalidParameters && res.InvalidParameters.length > 0) {
      // Loud, but don't crash — a missing optional secret shouldn't kill boot.
      // eslint-disable-next-line no-console
      console.error(
        '[secrets] SSM parameters not found:',
        res.InvalidParameters.join(', ')
      );
    }
  }

  for (const [envName, paramName] of Object.entries(mapping)) {
    const v = values[paramName];
    if (v != null) process.env[envName] = v;
  }

  hydrated = true;
};

export default loadSecretsIntoEnv;
