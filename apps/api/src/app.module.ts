import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AppConfigModule } from './config/app-config.module.js';
import { SharedModule } from './shared/shared.module.js';
import { ProblemDetailsFilter } from './shared/filters/problem-details.filter.js';
import { TenantInterceptor } from './shared/tenant/tenant.interceptor.js';

// Bounded-context modules (one per context — DOMAIN_RULES.md). Boundaries between them are
// enforced by dependency-cruiser (.dependency-cruiser.cjs) — a violation fails CI.
import { HealthModule } from './contexts/health/health.module.js';
import { IamModule } from './contexts/iam/iam.module.js';
import { OrganizationModule } from './contexts/organization/organization.module.js';
import { KnowledgeBaseModule } from './contexts/knowledge-base/knowledge-base.module.js';
import { AiEmployeeModule } from './contexts/ai-employee/ai-employee.module.js';
import { ConversationModule } from './contexts/conversation/conversation.module.js';
import { ChannelsModule } from './contexts/channels/channels.module.js';
import { VoiceModule } from './contexts/voice/voice.module.js';
import { CallsModule } from './contexts/calls/calls.module.js';
import { CrmModule } from './contexts/crm/crm.module.js';
import { QualificationModule } from './contexts/qualification/qualification.module.js';
import { CampaignModule } from './contexts/campaign/campaign.module.js';
import { AppointmentsModule } from './contexts/appointments/appointments.module.js';
import { NotificationsModule } from './contexts/notifications/notifications.module.js';
import { AnalyticsModule } from './contexts/analytics/analytics.module.js';
import { PlatformOpsModule } from './contexts/platform-ops/platform-ops.module.js';

@Module({
  imports: [
    AppConfigModule,
    SharedModule,
    HealthModule,
    IamModule,
    OrganizationModule,
    KnowledgeBaseModule,
    AiEmployeeModule,
    ConversationModule,
    ChannelsModule,
    VoiceModule,
    CallsModule,
    CrmModule,
    QualificationModule,
    CampaignModule,
    AppointmentsModule,
    NotificationsModule,
    AnalyticsModule,
    PlatformOpsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
