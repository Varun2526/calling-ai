import { describe, expect, it } from 'vitest';

import { ConfigValidationError, loadConfig } from './index.js';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://propulse:propulse@localhost:5432/propulse?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'change-me-locally',
  JWT_SECRET: 'change-me-locally',
  AWS_REGION: 'ap-south-1',
  S3_BUCKET: 'propulse-local',
  PUBLIC_WEB_URL: 'http://localhost:3000',
  PUBLIC_API_URL: 'http://localhost:4000',
} satisfies NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('accepts a valid set of env vars and groups them by concern', () => {
    const config = loadConfig(validEnv);

    expect(config.env).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.database.url).toBe(validEnv.DATABASE_URL);
    expect(config.database.poolMax).toBe(10); // default
    expect(config.redis.url).toBe(validEnv.REDIS_URL);
    expect(config.auth.jwtSecret).toBe('change-me-locally');
    expect(config.auth.invitationTokenTtlHours).toBe(72); // default
    expect(config.aws.region).toBe('ap-south-1');
    expect(config.ai.embeddingModel).toBe('text-embedding-3-large'); // default
    expect(config.http.apiPort).toBe(4000); // default
    expect(config.http.publicWebUrl).toBe('http://localhost:3000');
  });

  it('rejects missing required vars with an aggregated error', () => {
    const { DATABASE_URL: _db, JWT_SECRET: _jwt, ...partial } = validEnv;

    expect(() => loadConfig(partial)).toThrow(ConfigValidationError);

    try {
      loadConfig(partial);
    } catch (error) {
      const err = error as ConfigValidationError;
      expect(err.issues.some((i) => i.startsWith('DATABASE_URL'))).toBe(true);
      expect(err.issues.some((i) => i.startsWith('JWT_SECRET'))).toBe(true);
      expect(err.message).toContain('Invalid configuration');
    }
  });

  it('rejects malformed values (bad URL, non-numeric port)', () => {
    expect(() =>
      loadConfig({ ...validEnv, DATABASE_URL: 'not-a-url', API_PORT: 'abc' }),
    ).toThrow(ConfigValidationError);
  });

  it('requires provider secrets in production', () => {
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'production' })).toThrow(
      ConfigValidationError,
    );
  });

  it('accepts production when provider secrets are present', () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'sk-test',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tok',
      DEEPGRAM_API_KEY: 'dg',
      ELEVENLABS_API_KEY: 'el',
      WHATSAPP_BUSINESS_PHONE_ID: 'wa-phone',
      WHATSAPP_ACCESS_TOKEN: 'wa-token',
    });

    expect(config.isProduction).toBe(true);
    expect(config.voice.deepgramApiKey).toBe('dg');
  });
});
