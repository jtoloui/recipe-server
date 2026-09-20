import { loadSecretsIntoEnv } from './config/secrets';

/**
 * Lambda entrypoint. Hydrates process.env from SSM (once per cold start) BEFORE
 * the Express app module runs — the app's config reads process.env at import
 * time, so secrets must be in place first. Local dev keeps using index.ts
 * directly (SSM_SECRETS unset → loadSecretsIntoEnv is a no-op anyway).
 */
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
