import { DEV_DB_URL, loadConfig } from './config';

describe('loadConfig', () => {
  it('uses development defaults outside production', () => {
    expect(loadConfig({}).databaseUrl).toBe(DEV_DB_URL);
  });
  it('refuses to start in production without secrets', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL, API_TOKEN/);
  });
  it('refuses the development database in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', API_TOKEN: 't', DATABASE_URL: DEV_DB_URL })).toThrow();
  });
  it('accepts a complete production config', () => {
    expect(loadConfig({ NODE_ENV: 'production', API_TOKEN: 't', DATABASE_URL: 'postgres://x' }).production).toBe(true);
  });
});
