import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Run sources in-process; the fan-out path is tested with a stubbed SELF.
            RUN_MODE: 'inline',
            RETRY_DELAY_MS: '0',
            INGEST_TOKEN: 'test-ingest-token',
            INTERNAL_TOKEN: 'test-internal-token',
            PAGES_DEPLOY_HOOK: 'https://deploy-hook.test/hook',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
