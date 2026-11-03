export const DEV_DB_URL = 'postgres://fieldsync:fieldsync@localhost:5432/fieldsync';

export interface Config {
  port: number;
  databaseUrl: string;
  apiToken: string | undefined;
  corsOrigin: string | undefined;
  production: boolean;
}

/** Fails fast in production instead of silently running with unsafe defaults. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  if (production) {
    const missing = ['DATABASE_URL', 'API_TOKEN'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
    if (env.DATABASE_URL === DEV_DB_URL)
      throw new Error('DATABASE_URL must not be the development default in production');
  }
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? DEV_DB_URL,
    apiToken: env.API_TOKEN || undefined,
    corsOrigin: env.CORS_ORIGIN || undefined,
    production,
  };
}
