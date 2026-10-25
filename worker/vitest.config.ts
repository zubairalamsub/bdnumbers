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
            // The phone crawl is tested on its own (phones.test.ts); batch tests leave the shops alone.
            PHONE_CRAWL: 'off',
            INGEST_TOKEN: 'test-ingest-token',
            INTERNAL_TOKEN: 'test-internal-token',
            PAGES_DEPLOY_HOOK: 'https://deploy-hook.test/hook',
            // .dev.vars may hold real keys for these optional services; tests start with them off.
            ONESIGNAL_APP_ID: '',
            ONESIGNAL_KEY: '',
            BUTTONDOWN_API_KEY: '',
            ALERT_TO: '',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
