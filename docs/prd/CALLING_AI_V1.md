# Calling AI V1 — Source PRD (Business Source of Truth)

> This document is the **verbatim business source of truth** for Propulse AI.
> It MUST NOT be edited to change intent. Architectural interpretations,
> clarifications, and recommended amendments live in [`../PRD_REVIEW.md`](../PRD_REVIEW.md)
> and the [ADR log](../adr/). When code and this PRD disagree on *intent*, this PRD wins
> until an ADR supersedes a specific clause.

---

## Title

**Calling AI V1 — AI Operating System for Real Estate Lead Capture, Qualification, Campaigns & Site Visit Automation**

## Vision

Build a production-ready, enterprise-grade, multi-tenant platform called **Propulse AI**.

Propulse AI is an internal deployment platform that allows our team to deploy human-like
AI employees for real estate businesses in under 30 minutes.

- The platform is not public initially.
- Our team manages deployments.
- Clients receive dashboards and operational control over their business data.

The objective is to build AI employees that feel like highly trained pre-sales executives
and perform the work of an entire real estate inside sales team.

## Core Mission

- Never miss a buyer.
- Never miss a follow-up.
- Never lose customer context.
- Never let leads go cold.
- Capture, qualify, nurture, schedule, and convert property buyers automatically.

## Product Philosophy

Do not build chatbots. Build **AI employees**. The AI should: speak naturally, sound human,
reason like humans, remember context, ask follow-up questions, understand emotions, handle
objections, take actions, work proactively, operate across channels, work in regional
languages, and be better than an average pre-sales executive.

## Target Users

Real Estate Developers, Builders, Brokerage Firms, Real Estate Agencies, Individual Realtors,
Sales Teams, Pre-Sales Teams, Inside Sales Teams, CRM Teams.

## Core Architecture (business flow)

Organizations → Knowledge Base → AI Employees → Channels → Conversation Engine → CRM →
Campaign Engine → Appointments → Calls → Analytics.

## Technology Stack

- **Frontend:** Next.js, TypeScript, Tailwind, shadcn/ui
- **Backend:** NestJS, TypeScript, Prisma
- **Database:** AWS RDS PostgreSQL, PostgreSQL Full Text Search, pgvector
- **Storage:** AWS S3
- **Caching:** Redis, ElastiCache
- **Queues:** BullMQ
- **Realtime:** WebSockets
- **Deployment:** Docker, ECS Fargate
- **Monitoring:** CloudWatch, Sentry
- **Voice:** Twilio, Deepgram, OpenAI Realtime API, ElevenLabs
- **Messaging:** WhatsApp Business API
- **Maps:** Google Maps API

## Platform Modules

Authentication, Organizations, Knowledge Base, AI Employee Builder, Website Chat, WhatsApp,
Voice Agent, Conversation Engine, CRM, Campaign Engine, Appointments, Calls, Notifications,
Analytics, Admin Console.

## Authentication

No public signup. Only internal admins create organizations. Invitation system. Role-based
access. Session management.

## Roles

Super Admin, Operations Admin, Client Owner, Sales Manager, Sales Executive, Pre-Sales
Executive, Support.

## Organization Fields

Company Name, Logo, Business Hours, Timezone, Country, Languages, Brand Colors,
Notification Rules, Qualification Rules, Assignment Rules.

## Real Estate Templates

Templates: Developer, Builder, Broker, Agency, Individual Agent.

Applying a template automatically creates: CRM Pipeline, AI Employee, Qualification Questions,
Follow-Up Rules, Notifications, Dashboards, Campaign Templates, Appointment Rules.

## Knowledge Base

Sources: PDFs, Brochures, Pricing Sheets, FAQs, Website URLs, Text Notes, Videos, Documents.

Processing Pipeline (async): Upload → Extract Text → Clean → Chunk → Generate Embeddings →
Store → Index.

## AI Employee System

An AI employee has: Identity, Personality, Memory, Knowledge, Reasoning, Actions, Goals,
Metrics, Permissions, Escalation Rules.

- **Identity:** Name, Role, Department, Description.
- **Personality:** Professional, Friendly, Sales, Support, Custom.
- **Memory:** Customer Name, Phone, Budget, Location, Configuration, Timeline, Investment
  Goals, Objections, Past Conversations, Appointments, Past Calls, Preferences.
- **Knowledge:** Project Information, Brochures, Pricing, Amenities, FAQs, Construction
  Updates, Payment Plans, Location Information, Nearby Infrastructure, Policies.
- **Reasoning:** Understand context, infer intent, understand incomplete sentences, handle
  interruptions, ask follow-up questions, recommend next actions, make decisions.
- **Actions:** Create Lead, Update Lead, Book Site Visit, Send WhatsApp, Send Documents,
  Assign Executive, Schedule Follow-Up, Notify Team, Escalate Conversation, Search CRM,
  Search Knowledge.

## Human-Like Conversations

Sound natural, pause naturally, handle fillers, handle interruptions, handle corrections,
remember context, use conversational language, never sound scripted.

## Multilingual Support

Languages: English, Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi, Bengali, Gujarati,
Punjabi.

Mixed Language Support (e.g. Telugu+English, Hindi+English, Tamil+English). The AI should
auto-detect language, switch languages, remember preferences, respond naturally.

Regional Intelligence examples:
- "Schools daggara undali" → Family Buyer.
- "Rental yield ela untundi?" → Investor.
- "Loan process ela untundi?" → Financing Required.

## Channels

Website Chat, WhatsApp, Phone Calls, Meta Lead Forms, Google Lead Forms, CSV Imports, API
Imports. Everything becomes a unified customer timeline.

Customer Identity Resolution: find customer using Phone, Email, WhatsApp, Contact ID.
Prevent duplicate leads.

Unified Conversation Engine: Website → WhatsApp → Phone → Single Timeline. One customer,
one profile, one history.

## Lead Qualification Engine

Questions (configurable): Property Type, Budget, Location, Configuration, Timeline,
Investment or Self Use, Loan Requirement, Preferred Contact Method.

Lead Scoring factors: Budget, Timeline, Engagement, Buying Intent, Call Duration, Site Visit
Interest, Sentiment. Categories: Cold, Warm, Hot. Automatically updated.

## CRM

Entities: Contacts, Leads, Conversations, Activities, Calls, Appointments, Campaigns.

Lead Pipeline (configurable): New, Qualified, Visit Scheduled, Visit Completed, Negotiation,
Booked, Lost.

Automatic Assignment: Round Robin, Manual, Location Based, Project Based, Fallback
Assignment. No lead remains unassigned.

## Voice Agent System

Incoming Call → Speech To Text → AI Reasoning → Knowledge Search → CRM Search → Action
Execution → Text To Speech → Customer.

Capabilities: Real-Time Conversations, Interruptions, Context Retention, Natural Responses,
Human Transfer.

## Calls Module

Every call stores: Recording, Transcript, Summary, Sentiment, Lead Score, Requirements,
Action Items, Duration, Call Metadata.

Transcription Engine: Speaker Separation, Timestamps, Keyword Extraction, Transcript Search,
Download, Versioning.

AI Summaries automatically extract: Customer Name, Budget, Location, Property Type,
Configuration, Timeline, Loan Requirement, Objections, Sentiment, Recommended Actions.
Update CRM automatically.

Searchable Intelligence: e.g. "Budget above ₹1 crore", "3 BHK Hyderabad", "Villa enquiries",
"Loan enquiries", "Investment buyers". Search should work across transcripts.

## Appointment System

Types: Site Visit, Virtual Meeting, Phone Consultation. Features: Book, Reschedule, Cancel,
Reminders, Executive Assignment, Calendar Integration, Google Maps.

## Campaign Engine

Supports both Inbound Leads and Outbound Campaigns.

Sources: Meta Lead Lists, Google Lead Lists, CSV Uploads, CRM Lists, Manual Uploads, API
Imports.

Campaign Flow: Import Leads → Deduplicate → Enrich Data → Segment Audience → Assign Campaign
→ AI Outreach → Qualification → Appointment Booking → CRM Update → Analytics.

AI Outreach: call prospects, send WhatsApp, follow up automatically, handle objections,
schedule appointments, continue nurturing, stop when lead converts or opts out.

Segmentation: Budget, Location, Project Interest, Buying Intent, Timeline, Source, Language,
Lead Score.

Campaign Workflow: Campaign Created → Upload Leads → Choose Audience → Choose AI Employee →
Configure Messaging → Launch → Track Results.

## Follow-Up Engine (configurable)

- No Response: follow up after 1 day.
- Interested: send brochure.
- Site Visit Scheduled: send reminders.
- Missed Site Visit: reschedule.
- Brochure Viewed: follow up.
- Cold Lead: re-engage after X days.

## Human Handoff

Escalate when: confidence low, customer requests human, business rules trigger.

Flow: AI → Assign Executive → Notify Executive → Pause AI → Human Takes Over. Human can
return control to AI.

## Notification Engine

Channels: In App, Email, WhatsApp.

Events: New Lead, Lead Assigned, Appointment Booked, Missed Calls, Campaign Started, Campaign
Completed, Human Escalation, Follow-Up Due, Workflow Failure.

## Analytics

Metrics: Leads Captured, Calls Handled, Conversations, Appointments Booked, Campaign
Performance, Lead Sources, Response Time, Conversion Rate, Hot Leads, Sales Performance,
Agent Performance, Sentiment Distribution, Site Visit Conversion, Cost Per Lead, Return On
Ad Spend.

## Client Dashboard

Dashboard, Leads, Conversations, Calls, Appointments, Campaigns, Analytics, Documents,
Settings.

## Super Admin

Organizations, Users, Campaigns, Calls, Leads, Agents, Analytics, Audit Logs, System Health,
Settings.

## Onboarding Flow (target < 30 minutes)

Create Organization → Choose Real Estate Template → Upload Brochures → Upload Pricing →
Connect WhatsApp → Connect Phone → Configure Qualification Questions → Review AI Employee →
Test → Go Live.

## Primary Inbound Journey

Lead Arrives → AI Responds → AI Qualifies → Lead Created → Lead Scored → Executive Assigned
→ Site Visit Scheduled → Confirmation Sent → CRM Updated → Analytics Updated.

## Primary Outbound Journey

Import Lead List → AI Calls Prospect → AI Qualifies Buyer → AI Handles Questions → AI Shares
Information → AI Books Site Visit → CRM Updated → Executive Assigned → Follow-Ups Scheduled →
Analytics Updated.

## Final Product Goal

A real estate company should be able to upload brochures, connect WhatsApp and phone, import
lead lists, and deploy AI employees that can answer questions like humans, speak regional
languages, remember context, qualify buyers, run campaigns, call prospects, schedule site
visits, follow up automatically, record conversations, generate transcripts and summaries,
update CRM automatically, and provide complete visibility into the entire sales pipeline.

The AI should be so natural that buyers frequently ask: *"Was that an actual person or AI?"*
