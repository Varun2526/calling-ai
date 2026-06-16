// Propulse AI — Config
// Validated runtime configuration. This is the ONLY place process.env is read; every
// other package/app receives a typed `AppConfig` and never touches env directly.
// Env var names are the documented truth in .env.example; in staging/prod values come
// from AWS Secrets Manager / SSM (ARCHITECTURE §11), still parsed through here.

import { ZodError, z } from 'zod';

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
const logLevel = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');

const port = z.coerce.number().int().positive();

/**
 * The raw env schema. Required secrets are required only outside of `development`/`test`
 * so local/dev and unit tests can run without every provider key; in production they are
 * mandatory. Grouping into concerns happens after parse in `loadConfig`.
 */
const envSchema = z
  .object({
    // Core
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,

    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    // Redis
    REDIS_URL: z.string().url(),

    // Auth
    SESSION_SECRET: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    INVITATION_TOKEN_TTL_HOURS: z.coerce.number().int().positive().default(72),

    // AWS / Storage
    AWS_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    AWS_ENDPOINT_URL: z.string().url().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),

    // AI / LLM
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_REALTIME_MODEL: z.string().optional(),
    EMBEDDING_MODEL: z.string().default('text-embedding-3-large'),

    // Voice / Telephony
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    DEEPGRAM_API_KEY: z.string().optional(),
    ELEVENLABS_API_KEY: z.string().optional(),

    // WhatsApp / Messaging
    WHATSAPP_BUSINESS_PHONE_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),

    // Maps
    GOOGLE_MAPS_API_KEY: z.string().optional(),

    // Email
    EMAIL_FROM: z.string().default('no-reply@propulse.local'),
    SMTP_URL: z.string().optional(),

    // Observability
    SENTRY_DSN: z.string().optional(),
    CLOUDWATCH_LOG_GROUP: z.string().optional(),

    // HTTP — ports & public URLs
    WEB_PORT: port.default(3000),
    API_PORT: port.default(4000),
    VOICE_GATEWAY_PORT: port.default(4100),
    PUBLIC_WEB_URL: z.string().url(),
    PUBLIC_API_URL: z.string().url(),
  })
  .superRefine((env, ctx) => {
    // Provider secrets are optional in dev/test but mandatory in production.
    if (env.NODE_ENV !== 'production') return;
    const requiredInProd: Array<keyof typeof env> = [
      'OPENAI_API_KEY',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'DEEPGRAM_API_KEY',
      'ELEVENLABS_API_KEY',
      'WHATSAPP_BUSINESS_PHONE_ID',
      'WHATSAPP_ACCESS_TOKEN',
    ];
    for (const key of requiredInProd) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${String(key)} is required in production`,
        });
      }
    }
  });

type RawEnv = z.infer<typeof envSchema>;

/** Fully-typed, concern-grouped application configuration. */
export interface AppConfig {
  env: RawEnv['NODE_ENV'];
  isProduction: boolean;
  database: {
    url: string;
    poolMax: number;
  };
  redis: {
    url: string;
  };
  auth: {
    sessionSecret: string;
    jwtSecret: string;
    invitationTokenTtlHours: number;
  };
  aws: {
    region: string;
    s3Bucket: string;
    endpointUrl?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  ai: {
    openaiApiKey?: string;
    openaiRealtimeModel?: string;
    embeddingModel: string;
  };
  voice: {
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    deepgramApiKey?: string;
    elevenlabsApiKey?: string;
  };
  whatsapp: {
    businessPhoneId?: string;
    accessToken?: string;
    webhookVerifyToken?: string;
    appSecret?: string;
  };
  observability: {
    logLevel: RawEnv['LOG_LEVEL'];
    sentryDsn?: string;
    cloudwatchLogGroup?: string;
  };
  http: {
    webPort: number;
    apiPort: number;
    voiceGatewayPort: number;
    publicWebUrl: string;
    publicApiUrl: string;
    googleMapsApiKey?: string;
  };
  email: {
    from: string;
    smtpUrl?: string;
  };
}

/** Thrown when env validation fails, with one line per offending variable. */
export class ConfigValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/**
 * Parse and validate the environment into a typed `AppConfig`.
 * Throws an aggregated {@link ConfigValidationError} listing every invalid/missing var.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  let parsed: RawEnv;
  try {
    parsed = envSchema.parse(env);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.errors.map((e) => {
        const path = e.path.join('.') || '(root)';
        return `${path}: ${e.message}`;
      });
      throw new ConfigValidationError(issues);
    }
    throw error;
  }

  return {
    env: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    database: {
      url: parsed.DATABASE_URL,
      poolMax: parsed.DATABASE_POOL_MAX,
    },
    redis: {
      url: parsed.REDIS_URL,
    },
    auth: {
      sessionSecret: parsed.SESSION_SECRET,
      jwtSecret: parsed.JWT_SECRET,
      invitationTokenTtlHours: parsed.INVITATION_TOKEN_TTL_HOURS,
    },
    aws: {
      region: parsed.AWS_REGION,
      s3Bucket: parsed.S3_BUCKET,
      endpointUrl: parsed.AWS_ENDPOINT_URL,
      accessKeyId: parsed.AWS_ACCESS_KEY_ID,
      secretAccessKey: parsed.AWS_SECRET_ACCESS_KEY,
    },
    ai: {
      openaiApiKey: parsed.OPENAI_API_KEY,
      openaiRealtimeModel: parsed.OPENAI_REALTIME_MODEL,
      embeddingModel: parsed.EMBEDDING_MODEL,
    },
    voice: {
      twilioAccountSid: parsed.TWILIO_ACCOUNT_SID,
      twilioAuthToken: parsed.TWILIO_AUTH_TOKEN,
      deepgramApiKey: parsed.DEEPGRAM_API_KEY,
      elevenlabsApiKey: parsed.ELEVENLABS_API_KEY,
    },
    whatsapp: {
      businessPhoneId: parsed.WHATSAPP_BUSINESS_PHONE_ID,
      accessToken: parsed.WHATSAPP_ACCESS_TOKEN,
      webhookVerifyToken: parsed.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      appSecret: parsed.WHATSAPP_APP_SECRET,
    },
    observability: {
      logLevel: parsed.LOG_LEVEL,
      sentryDsn: parsed.SENTRY_DSN,
      cloudwatchLogGroup: parsed.CLOUDWATCH_LOG_GROUP,
    },
    http: {
      webPort: parsed.WEB_PORT,
      apiPort: parsed.API_PORT,
      voiceGatewayPort: parsed.VOICE_GATEWAY_PORT,
      publicWebUrl: parsed.PUBLIC_WEB_URL,
      publicApiUrl: parsed.PUBLIC_API_URL,
      googleMapsApiKey: parsed.GOOGLE_MAPS_API_KEY,
    },
    email: {
      from: parsed.EMAIL_FROM,
      smtpUrl: parsed.SMTP_URL,
    },
  };
}
