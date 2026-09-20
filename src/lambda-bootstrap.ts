import { loadSecretsIntoEnv } from './config/secrets';

/**
 * Lambda entrypoint. Hydrates process.env from SSM (once per cold start) BEFORE
 * the Express app module runs — the app's config reads process.env at import
 * time, so secrets must be in place first. Local dev keeps using index.ts
 * directly (SSM_SECRETS unset → loadSecretsIntoEnv is a no-op anyway).
 */
// Process-level safety net: a stray unhandled promise rejection (e.g. a
// transient DB blip on a warm container) must NOT terminate the process. Node's
// default behaviour is to crash on unhandledRejection -> Runtime.ExitError. Log
// instead so the container survives; the in-flight request already returned 5xx.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[lambda-bootstrap] unhandledRejection:', reason);
});

async function bootstrap(): Promise<void> {
  await loadSecretsIntoEnv();
  // Import AFTER env is hydrated so the top-level config picks up the values.
  await import('../index.js');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[lambda-bootstrap] failed to start:', err);
  process.exit(1);
});
