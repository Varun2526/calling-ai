import { Global, Module } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@propulse/config';

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Validates and provides AppConfig once at boot. This is the ONLY place env is read in the
 * API (via @propulse/config). Inject with `@Inject(APP_CONFIG)`.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
