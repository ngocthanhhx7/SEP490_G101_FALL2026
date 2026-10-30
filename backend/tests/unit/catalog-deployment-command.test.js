import { test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';

test('production catalog command defaults to dry run without connecting to a database', () => {
  const result = spawnSync(process.execPath, ['scripts/deployment/provision-demo-catalog.js'], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, NODE_ENV: 'production', MONGO_URI: '', MONGO_DB: '' } });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ state: 'DRY_RUN', key: 'pawworld-demo-sheet-2026-10-30-v1', services: 13 });
});
test('production catalog apply refuses absent target confirmation and never prints connection data', () => {
  const result = spawnSync(process.execPath, ['scripts/deployment/provision-demo-catalog.js', '--apply'], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, NODE_ENV: 'production', MONGO_URI: 'mongodb://synthetic:password@127.0.0.1:1', MONGO_DB: 'synthetic_target',
      CONFIRMED_CATALOG_KEY: '', CONFIRMED_CATALOG_DATABASE: '' } });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Catalog provisioning stopped');
  expect(result.stderr).not.toContain('password');
});
