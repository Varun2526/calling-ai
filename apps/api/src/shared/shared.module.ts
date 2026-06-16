import { Global, Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { EventsModule } from './events/events.module.js';

/**
 * Cross-cutting infrastructure shared by all bounded contexts: Prisma (tenant-scoped),
 * the event bus + outbox. Context modules import nothing from each other — only this shared
 * layer and @propulse/* packages (REPOSITORY_STRUCTURE §5).
 */
@Global()
@Module({
  imports: [PrismaModule, EventsModule],
  exports: [PrismaModule, EventsModule],
})
export class SharedModule {}
