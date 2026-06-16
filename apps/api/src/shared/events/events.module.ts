import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';
import { EventBus } from './event-bus.js';

@Global()
@Module({
  providers: [OutboxService, EventBus],
  exports: [OutboxService, EventBus],
})
export class EventsModule {}
