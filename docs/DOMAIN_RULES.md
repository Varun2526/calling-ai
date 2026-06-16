# Propulse AI — Domain Model & Rules (Phase 2)

> **Owner:** Domain owners per context (see CODEOWNERS) · **Update frequency:** whenever an
> aggregate, invariant, or domain event changes (with an ADR if architecturally significant).
> Builds on [`ARCHITECTURE.md`](ARCHITECTURE.md). This is the contract for the _domain layer_ —
> the rules here must hold regardless of API, DB, or UI.

---

## How to read this document

Each bounded context section follows the same template:

- **Responsibilities** — what it owns and decides.
- **Aggregate roots** — consistency boundaries; the only objects repositories return/save.
- **Entities** — have identity, live inside an aggregate.
- **Value objects (VO)** — immutable, equality-by-value, self-validating.
- **Domain services** — logic that doesn't belong to a single aggregate.
- **Repositories** — persistence ports (interfaces only; implementations are infrastructure).
- **Domain events** — past-tense facts emitted on state change (see [`EVENT_CATALOG.md`](EVENT_CATALOG.md)).
- **External dependencies** — other contexts / third parties (always via ports).
- **Invariants** — rules that MUST always hold.
- **Never-violate rules** — the subset whose violation is a Sev-1 correctness/security bug.

**Global invariants (apply to every context):**

1. Every aggregate carries an immutable `organizationId`; it is set at creation and never changes.
2. No aggregate references another aggregate by object — only by typed ID.
3. A single transaction mutates exactly **one** aggregate instance. Cross-aggregate effects go via events.
4. Money is a `Money` VO (amount as integer minor units + currency); never a float. Default currency INR.
5. Phone numbers are an `E164Phone` VO; timestamps are UTC `Instant`s; user-facing times resolve via the org `Timezone`.

---

## BC-1 — Identity & Access (IAM) _(Generic / Shared Kernel for IDs)_

- **Responsibilities:** organizations-as-tenants, users, role assignment, invitations,
  sessions. Source of truth for "who is this and which org".
- **Aggregate roots:**
  - `Organization` (also the tenant root) — but org _business config_ lives in the
    Organization context (BC-9); here it holds only identity/lifecycle (status: active/suspended).
  - `User` — platform or tenant user; holds role assignments.
  - `Invitation` — pending access grant.
- **Entities:** `RoleAssignment` (within User), `Session`.
- **Value objects:** `Email`, `Role` (enum: SuperAdmin, OperationsAdmin, ClientOwner,
  SalesManager, SalesExecutive, PreSalesExecutive, Support), `InvitationToken` (signed,
  single-use, TTL), `OrganizationId`, `UserId`.
- **Domain services:** `InvitationService` (issue/accept/expire), `AuthorizationPolicy`
  (builds the CASL ability from role + scope — see ARCHITECTURE §11).
- **Repositories:** `OrganizationRepository`, `UserRepository`, `InvitationRepository`,
  `SessionStore` (Redis-backed).
- **Domain events:** `iam.organization.created.v1`, `iam.user.invited.v1`,
  `iam.user.activated.v1`, `iam.role.assigned.v1`, `iam.session.revoked.v1`.
- **External deps:** Notifications (to send invite emails) — via event.
- **Invariants:** an active User has ≥1 RoleAssignment; platform roles are not scoped to a
  single org; tenant roles are scoped to exactly one org; an Invitation is single-use and
  expires.
- **Never-violate:** **No public self-registration path exists** (PRD). A User's
  `organizationId` (for tenant roles) is immutable after activation. Tokens are never logged.

---

## BC-9 — Organization & Onboarding _(Supporting; templates are differentiating)_

- **Responsibilities:** org business profile/config, real-estate **templates**, onboarding
  wizard state, and the rule sets (notification/qualification/assignment) the org operates by.
- **Aggregate roots:**
  - `OrganizationProfile` — company name, logo, business hours, timezone, country, languages,
    brand colors.
  - `OnboardingFlow` — ordered steps + completion state, drives the < 30-min wizard.
  - `RealEstateTemplate` — a template _definition_ (Developer/Builder/Broker/Agency/Individual).
- **Entities:** `BusinessHours` (per-day windows), `NotificationRuleSet`,
  `QualificationRuleSet`, `AssignmentRuleSet`, `OnboardingStep`.
- **Value objects:** `Timezone` (IANA), `Country` (ISO-3166), `Language` (enum of the 10 PRD
  languages), `BrandColors`, `HexColor`.
- **Domain services:** `TemplateApplicationService` — **applies a template**, which emits
  intents to provision: CRM pipeline, an AI Employee, qualification questions, follow-up
  rules, notifications, dashboards, campaign templates, appointment rules (PRD). This is a
  _saga_: it commands other contexts via events and tracks completion.
- **Repositories:** `OrganizationProfileRepository`, `OnboardingFlowRepository`,
  `TemplateRepository`.
- **Domain events:** `org.profile.updated.v1`, `org.template.applied.v1`,
  `org.onboarding.step.completed.v1`, `org.onboarding.completed.v1`, and provisioning intents
  consumed by other contexts (`org.provision.pipeline.requested.v1`, etc.).
- **External deps:** CRM, AI Employee, Campaign, Appointments, Notifications (all via events).
- **Invariants:** business hours non-overlapping per day; `languages` ⊆ supported set;
  applying a template is idempotent (re-apply doesn't duplicate provisioned artifacts).
- **Never-violate:** template application that fails partway must be **re-drivable to
  completion** (saga compensation/idempotency) — onboarding must never strand an org half-set-up.

---

## BC-5 — Knowledge Base _(Supporting)_

- **Responsibilities:** ingest sources → produce retrievable, grounded knowledge for AI
  Employees. Owns the RAG corpus and retrieval.
- **Aggregate roots:**
  - `KnowledgeSource` — an uploaded/linked source (PDF, brochure, pricing sheet, FAQ, URL,
    text note, video, document) with an ingestion lifecycle.
  - `Document` — normalized extracted content from a source (a source may yield ≥1 document).
- **Entities:** `Chunk` (text span with position/metadata), `Embedding` (vector + model id),
  `IngestionJob` (status: pending→extracting→chunking→embedding→indexed→failed).
- **Value objects:** `SourceType`, `MimeType`, `ChunkRange`, `EmbeddingModel`,
  `RetrievalQuery`, `RetrievalResult` (chunk + score + citation).
- **Domain services:** `IngestionPipeline` (orchestrates extract→clean→chunk→embed→index, all
  async), `RetrievalService` (hybrid: pgvector semantic + Postgres FTS keyword + rerank),
  `CitationBuilder` (so answers can cite source/page).
- **Repositories:** `KnowledgeSourceRepository`, `DocumentRepository`, `ChunkRepository`,
  `VectorIndex` (port over pgvector).
- **Domain events:** `kb.source.uploaded.v1`, `kb.ingestion.started.v1`,
  `kb.ingestion.completed.v1`, `kb.ingestion.failed.v1`, `kb.source.reindexed.v1`.
- **External deps:** S3 (raw files), embedding provider (OpenAI), PDF/doc extractors,
  transcription for video — via ports.
- **Invariants:** a `Chunk` always traces to a `Document`→`Source`; embeddings record the
  model+version (so re-embeds on model change are detectable); retrieval is always
  tenant-filtered by `organizationId`.
- **Never-violate:** **Retrieval must never return another tenant's chunks.** Ingestion of a
  failed source is retryable without producing duplicate chunks (idempotent by content hash).

---

## BC-2 — Conversation Engine _(Core — the hub)_

- **Responsibilities:** the single unified, cross-channel **timeline** per Contact; identity
  resolution; message ingestion/ordering; conversation lifecycle and handoff state.
- **Aggregate roots:**
  - `Conversation` — the consistency boundary for a thread with one Contact across channels.
    Holds the ordered `Timeline` and current `ControlState` (AI / Human / Paused).
  - `IdentityResolution` — the graph linking channel identifiers (phone/email/WA id/contactId)
    to a single `ContactId`.
- **Entities:** `Message` (turn: direction, channel, author=AI|Human|Contact, content,
  timestamp, metadata), `TimelineEntry`, `ChannelIdentity` (a known identifier for a contact).
- **Value objects:** `Channel` (WebsiteChat, WhatsApp, Voice, LeadForm, Import),
  `MessageContent` (text/media/structured), `ConversationStatus`, `ControlState`,
  `LanguageTag` (incl. mixed e.g. `te-en`), `ConfidenceScore`.
- **Domain services:** `IdentityResolver` (match/merge by phone/email/WA/contactId; prevent
  duplicates), `TimelineAssembler` (merge multi-channel into one ordered history),
  `HandoffCoordinator` (AI↔human control transitions).
- **Repositories:** `ConversationRepository`, `MessageRepository`, `IdentityResolutionRepository`.
- **Domain events:** `channels.message.received.v1` (in), `conversation.created.v1`,
  `conversation.message.appended.v1`, `conversation.identity.merged.v1`,
  `conversation.handoff.requested.v1`, `conversation.control.transferred.v1`.
- **External deps:** Channels (adapters in), AI Employee (reasoning), CRM (ContactId), Notifications.
- **Invariants:** one Contact ⇒ one canonical timeline (merges, never duplicates); messages
  are append-only and strictly ordered within a conversation; `ControlState` transitions are
  legal only along AI→Paused→Human and Human→AI.
- **Never-violate:** **Identity resolution must never merge two different real people** (false
  merge is worse than a missed merge — prefer leaving separate and flagging). A paused AI must
  not send messages. The timeline is the source of truth for "what was said" — never silently mutate history.

---

## BC-1.AI — AI Employee _(Core — the brain)_

- **Responsibilities:** the configured agent (identity, personality, knowledge bindings,
  permitted actions, goals, escalation rules); **prompt assembly**; **reasoning
  orchestration**; deciding which **actions** to take. Does NOT own conversations, CRM, KB, or
  appointments — it _reads_ and _commands_ them.
- **Aggregate roots:**
  - `AIEmployee` — config aggregate: identity, personality, language settings, knowledge-source
    bindings, granted actions, goals, metrics config, escalation rules, permissions.
  - `ReasoningSession` — a bounded reasoning episode tied to a Conversation/Call turn (the
    working memory + decision trace for one or more turns).
- **Entities:** `PersonalityProfile`, `ActionGrant` (which of the action set this employee may
  perform), `EscalationRule`, `Goal`, `KnowledgeBinding`.
- **Value objects:** `EmployeeIdentity` (name/role/department/description), `PersonalityType`
  (Professional/Friendly/Sales/Support/Custom), `Persona` (assembled system prompt inputs),
  `ActionType` (CreateLead, UpdateLead, BookSiteVisit, SendWhatsApp, SendDocuments,
  AssignExecutive, ScheduleFollowUp, NotifyTeam, EscalateConversation, SearchCRM,
  SearchKnowledge), `ActionIntent` (a requested action + params + originating turn),
  `Confidence`.
- **Domain services:** `PromptAssembler` (persona + relevant memory + retrieved knowledge +
  CRM context + tools → model input), `ReasoningOrchestrator` (calls LLM port, interprets
  tool/function calls into `ActionIntent`s), `ActionDispatcher` (validates the intent against
  `ActionGrant` + permissions, then emits the corresponding command/event to the owning
  context), `EscalationEvaluator` (confidence/rule-based handoff), `LanguageRouter` (detect &
  select language/model per turn).
- **Repositories:** `AIEmployeeRepository`, `ReasoningSessionStore` (ephemeral, Redis).
- **Domain events:** `ai.employee.created.v1`, `ai.employee.updated.v1`,
  `ai.action.intended.v1`, `ai.action.dispatched.v1`, `ai.escalation.raised.v1`,
  `ai.reasoning.completed.v1` (carries confidence, tokens — for cost/analytics).
- **External deps:** LLM (OpenAI), Knowledge Base (retrieval), CRM (search/upsert via
  intents), Conversation Engine (turns + memory), all action-target contexts.
- **Invariants:** an AI Employee can only perform actions it has been **granted**; every action
  it takes is traceable to a `ReasoningSession` + originating message/turn; persona/prompt
  assembly is deterministic given the same inputs (for reproducibility/eval).
- **Never-violate:** **Never execute an action outside the employee's `ActionGrant` or the
  tenant's permissions.** Never present ungrounded facts about price/inventory as
  authoritative — answers about KB-backed facts must be retrieval-grounded or escalate.
  Respect opt-out/DNC before any outbound action.

---

## BC-6 — CRM _(Supporting)_

- **Responsibilities:** Contacts, Leads, pipeline, activities, assignment. The system of record
  for sales opportunities.
- **Aggregate roots:**
  - `Contact` — the person (deduplicated). Holds channel identities mirror, preferences.
  - `Lead` — an opportunity attached to a Contact; holds pipeline `Stage`, score (denormalized
    from Lead Qualification), assignment, and qualification answers snapshot.
  - `Pipeline` — the configurable stage definition for the org.
- **Entities:** `Activity` (note/call/message/system event on a lead), `Assignment`
  (lead↔executive binding with reason), `StageHistory`.
- **Value objects:** `PipelineStage` (New, Qualified, VisitScheduled, VisitCompleted,
  Negotiation, Booked, Lost — configurable), `LeadSource` (WebsiteChat/WhatsApp/Phone/Meta/
  Google/CSV/API), `LeadScoreSnapshot` (value + category Cold/Warm/Hot), `AssignmentStrategy`
  (RoundRobin, Manual, LocationBased, ProjectBased, Fallback), `Budget` (Money range),
  `Configuration` (e.g. 3BHK), `Timeline` (buying horizon).
- **Domain services:** `IdentityResolution` _consumes_ Conversation Engine's resolution to
  avoid dupes; `AssignmentService` (applies strategy; **guarantees no lead is left
  unassigned** via fallback); `PipelineService` (legal stage transitions).
- **Repositories:** `ContactRepository`, `LeadRepository`, `PipelineRepository`,
  `ActivityRepository`.
- **Domain events:** `crm.contact.created.v1`, `crm.contact.merged.v1`, `crm.lead.created.v1`,
  `crm.lead.updated.v1`, `crm.lead.stage.changed.v1`, `crm.lead.assigned.v1`,
  `crm.lead.unassigned.v1`, `crm.activity.logged.v1`.
- **External deps:** Conversation Engine (identity), Lead Qualification (score), Campaign,
  Appointments, Notifications — via events.
- **Invariants:** a Lead always belongs to exactly one Contact and one Pipeline; stage
  transitions follow the pipeline's allowed graph; **every active Lead is assigned** (fallback
  assignment guarantees this); a Contact is unique per `(organizationId, resolved identity)`.
- **Never-violate:** **No duplicate Contact for the same resolved person.** A Lead cannot be
  silently deleted (it goes to `Lost` with a reason — audit trail preserved). Assignment must
  never drop a lead into "unassigned" limbo.

---

## BC-7 — Lead Qualification & Scoring _(Supporting)_

- **Responsibilities:** configurable qualification question sets; capturing answers; computing
  and updating lead score/category.
- **Aggregate roots:** `QualificationSet` (the org's configured questions), `LeadScore` (the
  evolving score for a lead).
- **Entities:** `QualificationQuestion`, `QualificationAnswer`, `ScoringFactor`.
- **Value objects:** `QuestionType` (PropertyType, Budget, Location, Configuration, Timeline,
  InvestmentOrSelfUse, LoanRequirement, PreferredContact + custom), `ScoreFactor` (Budget,
  Timeline, Engagement, BuyingIntent, CallDuration, SiteVisitInterest, Sentiment), `ScoreValue`,
  `ScoreCategory` (Cold/Warm/Hot), `ScoringWeights`.
- **Domain services:** `ScoringEngine` (weights × factors → value → category; pure, testable),
  `QualificationService` (which question to ask next given known answers).
- **Repositories:** `QualificationSetRepository`, `LeadScoreRepository`.
- **Domain events:** `qualification.answer.captured.v1`, `qualification.completed.v1`,
  `leadscore.updated.v1`, `leadscore.category.changed.v1` (e.g. Warm→Hot).
- **External deps:** AI Employee (captures answers in conversation), CRM (projects score onto
  Lead), Calls (call duration/sentiment factors), Analytics.
- **Invariants:** score is a pure function of recorded factors + weights (reproducible);
  category thresholds are org-configurable; questions are configurable per org/template.
- **Never-violate:** scoring must be **explainable** — every score change records the factors
  that caused it (no opaque score mutations). The CRM copy of the score is always derived from
  `leadscore.updated.v1`, never edited directly.

---

## BC-3 — Voice / Telephony _(Core)_ & BC-8.Calls — Calls & Transcription

> Two collaborating contexts; Voice handles the _live_ call, Calls handles the _artifacts_.

**Voice / Telephony**

- **Responsibilities:** call lifecycle (incoming/outgoing), the realtime STT↔LLM↔TTS loop,
  interruptions, human transfer.
- **Aggregate roots:** `Call` (lifecycle: ringing→active→completed/failed/transferred),
  `VoiceSession` (the live realtime session, ephemeral).
- **Entities:** `CallLeg`, `TransferRequest`.
- **Value objects:** `CallDirection`, `CallStatus`, `TelephonyProvider` (Twilio),
  `MediaStreamRef`, `Latency`.
- **Domain services:** `CallOrchestrator` (drives the realtime loop using AI Employee
  reasoning + KB/CRM search ports + STT/TTS ports), `BargeInHandler` (interruptions),
  `TransferService` (to human).
- **Repositories:** `CallRepository`, `VoiceSessionStore` (Redis).
- **Domain events:** `calls.incoming.received.v1`, `calls.started.v1`, `calls.ended.v1`,
  `calls.transferred.v1`, `calls.recording.available.v1`.
- **Never-violate:** consent/announcement before recording where required; a dropped session
  must not lose the call record; transfer to human must never silently fail (fallback to
  callback/notification).

**Calls & Transcription**

- **Responsibilities:** recordings, transcripts (speaker-separated, timestamped), AI summaries,
  sentiment, extracted requirements, action items, searchable transcript intelligence.
- **Aggregate roots:** `CallRecord` (the post-call artifact aggregate), `Transcript`.
- **Entities:** `RecordingAsset` (S3 ref), `TranscriptSegment` (speaker + timestamp + text),
  `CallSummary`, `ExtractedRequirements`.
- **Value objects:** `Sentiment`, `Keyword`, `TranscriptVersion`, `ActionItem`, `S3ObjectKey`.
- **Domain services:** `TranscriptionService` (Deepgram port; speaker separation, timestamps),
  `SummarizationService` (LLM port → extract name/budget/location/type/config/timeline/loan/
  objections/sentiment/recommended actions), `TranscriptSearch` (FTS over transcripts).
- **Domain events:** `calls.transcript.completed.v1`, `calls.summary.completed.v1`,
  `calls.sentiment.computed.v1`, `calls.requirements.extracted.v1` (→ CRM auto-update).
- **External deps:** S3, Deepgram, LLM, CRM (auto-update), Lead Qualification (factors), Analytics.
- **Invariants:** every completed call has a recording (or a recorded reason it doesn't) and a
  transcript job; transcripts are versioned (re-transcription doesn't destroy prior version);
  summary extraction maps to CRM fields via explicit mapping (auditable).
- **Never-violate:** **Auto-updating CRM from a summary must be traceable and reversible**
  (record source = which call/summary). Recordings/transcripts are PII — tenant-scoped S3
  prefixes + signed short-lived URLs only.

---

## BC-4 — Campaign Engine _(Core)_

- **Responsibilities:** inbound + outbound campaigns; lead-list import/dedup/enrich; audience
  segmentation; outreach orchestration (call/WhatsApp); the **follow-up engine**; stop on
  convert/opt-out.
- **Aggregate roots:** `Campaign` (config + status: draft→running→paused→completed),
  `LeadList` (imported set + dedup state), `OutreachAttempt` (per-prospect attempt lifecycle),
  `FollowUpRule` (+ `FollowUpSchedule` state per lead).
- **Entities:** `Segment` (audience definition), `ImportBatch`, `EnrichmentResult`,
  `CampaignStep`.
- **Value objects:** `CampaignType` (Inbound/Outbound), `CampaignSource` (MetaLeadList,
  GoogleLeadList, CSV, CRMList, Manual, API), `SegmentCriteria` (Budget, Location,
  ProjectInterest, BuyingIntent, Timeline, Source, Language, LeadScore), `OutreachChannel`
  (Call/WhatsApp), `OptOutStatus`, `FollowUpTrigger` (NoResponse, Interested,
  SiteVisitScheduled, MissedSiteVisit, BrochureViewed, ColdLead).
- **Domain services:** `LeadImportService` (import→**deduplicate** via Conversation Engine
  identity→enrich), `SegmentationService`, `CampaignOrchestrator` (drives outreach through AI
  Employee + Channels, respects per-tenant rate limits), `FollowUpEngine` (rule→schedule→fire;
  stops on convert/opt-out).
- **Repositories:** `CampaignRepository`, `LeadListRepository`, `OutreachAttemptRepository`,
  `FollowUpRepository`.
- **Domain events:** `campaign.created.v1`, `campaign.launched.v1`,
  `campaign.leadlist.imported.v1`, `campaign.leadlist.deduplicated.v1`,
  `campaign.outreach.attempted.v1`, `campaign.outreach.responded.v1`,
  `followup.scheduled.v1`, `followup.fired.v1`, `campaign.completed.v1`, `campaign.optout.recorded.v1`.
- **External deps:** CRM (lists/leads), AI Employee (outreach reasoning), Voice + WhatsApp
  channels, Appointments, Conversation Engine (dedup), Notifications, Analytics.
- **Invariants:** a prospect on a campaign is processed at-most-once per step (idempotent
  attempts); dedup runs before outreach; segmentation criteria evaluate against current data.
- **Never-violate:** **Stop all outreach immediately on opt-out/DNC or on conversion.** Never
  contact a prospect who opted out. Respect per-tenant and per-provider rate limits (no
  spamming, no quota blowups). Outbound calling must respect consent/legal windows (see PRD review).

---

## BC-8.Appt — Appointments _(Supporting)_

- **Responsibilities:** site visits / virtual / phone consultations; booking, reschedule,
  cancel; reminders; executive assignment; calendar + maps integration.
- **Aggregate roots:** `Appointment` (lifecycle: requested→scheduled→reminded→completed/
  cancelled/no-show/rescheduled).
- **Entities:** `Reminder`, `CalendarLink`.
- **Value objects:** `AppointmentType` (SiteVisit/Virtual/PhoneConsult), `TimeSlot` (tz-aware),
  `Location` (+ Google Maps place ref), `AppointmentStatus`.
- **Domain services:** `SchedulingService` (slot validation against business hours +
  executive availability), `ReminderScheduler`, `CalendarSync` (port).
- **Repositories:** `AppointmentRepository`.
- **Domain events:** `appointments.sitevisit.requested.v1`, `appointments.booked.v1`,
  `appointments.rescheduled.v1`, `appointments.cancelled.v1`, `appointments.reminder.due.v1`,
  `appointments.noshow.recorded.v1`, `appointments.completed.v1`.
- **External deps:** CRM (lead/contact), Notifications (confirmations/reminders), Google Maps,
  calendar providers, Org (business hours).
- **Invariants:** no double-booking of the same executive slot; appointment time respects org
  business hours + timezone; a missed site visit triggers the follow-up reschedule path.
- **Never-violate:** confirmations and reminders for a booked appointment must be reliably
  scheduled (a booked visit without a confirmation is a defect).

---

## BC-12 — Notifications _(Generic)_

- **Responsibilities:** deliver event-driven notifications across in-app / email / WhatsApp per
  org notification rules.
- **Aggregate roots:** `NotificationRequest` (dispatch lifecycle), `NotificationRule`.
- **Value objects:** `NotificationChannel` (InApp/Email/WhatsApp), `NotificationEvent` (NewLead,
  LeadAssigned, AppointmentBooked, MissedCall, CampaignStarted, CampaignCompleted,
  HumanEscalation, FollowUpDue, WorkflowFailure), `DeliveryStatus`.
- **Domain services:** `NotificationRouter` (event→channels per rules + role targeting),
  `DeliveryService` (per-channel adapters: WS/in-app, SES, WhatsApp).
- **Domain events:** `notifications.dispatch.requested.v1`, `notifications.delivered.v1`,
  `notifications.failed.v1`.
- **Invariants:** idempotent delivery (dedupe by event id + recipient + channel); respects org
  rules; failures are retried with backoff then dead-lettered + surfaced.
- **Never-violate:** `WorkflowFailure` / escalation notifications must not themselves be
  silently dropped (these are the "the system is broken" signals).

---

## BC-13 — Analytics _(Generic; read-model only)_

- **Responsibilities:** build read models from events; serve dashboard metrics (leads, calls,
  conversations, appointments, campaign perf, sources, response time, conversion, hot leads,
  sales/agent performance, sentiment distribution, site-visit conversion, CPL, ROAS).
- **Aggregate roots:** none in the write sense — owns **projections / read models** keyed by org.
- **Domain services:** `ProjectionBuilders` (one per metric family), `MetricsQueryService`.
- **External deps:** consumes events from _every_ context (downstream); read replica of DB.
- **Invariants:** projections are rebuildable by replaying events (idempotent, ordered);
  Analytics holds **no authoritative operational state**.
- **Never-violate:** Analytics must never write back to operational tables; metrics are
  tenant-scoped.

---

## BC-14 — Platform Ops / Admin _(Generic)_

- **Responsibilities:** super-admin views across orgs, append-only **audit log**, feature
  flags, system health.
- **Aggregate roots:** `AuditEntry` (append-only), `FeatureFlag`.
- **Invariants:** audit entries are immutable and complete for sensitive/cross-tenant actions;
  cross-tenant admin access is always audited.
- **Never-violate:** the audit log is never editable or deletable through the application.

---

## Separation-of-concerns recommendations

1. **Keep real-estate specifics in the config/template layer, not the core domain.** Pipeline
   stages, qualification questions, scoring weights, follow-up rules are _data_, not code, so
   new verticals/templates don't fork the domain.
2. **AI Employee orchestrates; it does not own.** All persistent state belongs to CRM/KB/
   Conversation/Appointments. The AI's only owned state is its config + ephemeral reasoning
   session. This keeps the "brain" swappable and testable.
3. **Conversation Engine owns "what was said"; CRM owns "what it means for the deal".** Don't
   leak conversation storage into CRM or vice versa.
4. **Scoring is a pure function** isolated in Lead Qualification — never inline scoring logic
   into CRM or the AI prompt.
5. **Channels are thin adapters.** No business logic in webhook controllers — normalize and
   hand to Conversation Engine.
6. **Calls split live (Voice) from artifacts (Calls)** so realtime latency concerns never mix
   with batch transcription/summarization concerns.
7. **Everything cross-context is an event.** If you're tempted to import another context's
   service to cause a side effect, emit an event instead.
