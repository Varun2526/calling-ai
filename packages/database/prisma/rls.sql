-- ─────────────────────────────────────────────────────────────────────────────
-- Propulse AI — Postgres Row-Level Security (RLS) policies
--
-- This is the THIRD and final layer of tenant isolation (see docs/ARCHITECTURE.md
-- §10). Layers 1 (app guard) and 2 (Prisma tenant extension) live in application
-- code and can be defeated by a bug; RLS is the database-enforced backstop that
-- holds even if app code forgets a `where: { organizationId }`.
--
-- Mechanism: every tenant-scoped table has RLS enabled and a policy that compares
-- its `organization_id` column against the GUC `app.current_org`, set per
-- transaction by the application:
--
--     SET LOCAL app.current_org = '<the authenticated org id>';
--
-- `current_setting('app.current_org', true)` returns NULL when unset (the `true`
-- = "missing_ok"), so a connection that forgot to set the org sees ZERO rows
-- rather than erroring or leaking — fail closed.
--
-- IMPORTANT — privileged bypass: the normal application database role MUST NOT have
-- BYPASSRLS and MUST NOT own these tables (table owners bypass RLS unless
-- FORCE ROW LEVEL SECURITY is set — which we do below). A SEPARATE privileged role
-- (e.g. `propulse_superadmin`) is used ONLY by audited super-admin / platform-ops
-- code paths to operate across tenants. Every such cross-tenant access is recorded
-- in audit_logs.
--
-- Apply this file as part of a Prisma migration (it is NOT auto-generated from the
-- schema). Keep it versioned alongside the schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: resolves the active tenant for the current transaction, or NULL if unset.
-- Defined as a function so policies read cleanly and the GUC name lives in one place.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT current_setting('app.current_org', true) $$;

-- ─── users ────────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY; -- applies even to the table owner
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (organization_id = app_current_org())          -- rows visible for SELECT/UPDATE/DELETE
  WITH CHECK (organization_id = app_current_org());     -- rows allowed for INSERT/UPDATE

-- ─── contacts ───────────────────────────────────────────────────────────────--
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON contacts;
CREATE POLICY tenant_isolation ON contacts
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ─── leads ──────────────────────────────────────────────────────────────────--
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON leads;
CREATE POLICY tenant_isolation ON leads
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ─── outbox_events ──────────────────────────────────────────────────────────--
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON outbox_events;
CREATE POLICY tenant_isolation ON outbox_events
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ─── audit_logs ──────────────────────────────────────────────────────────────-
-- audit_logs.organization_id is NULLABLE: platform-level (cross-tenant) super-admin
-- entries have NULL org. Tenant connections see only their own rows; the NULL
-- platform rows are visible only to the privileged super-admin role (which bypasses
-- RLS). Append-only is enforced at the app/grant layer (no UPDATE/DELETE grants).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
CREATE POLICY tenant_isolation ON audit_logs
  USING (organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage example (every tenant-scoped unit of work):
--
--   BEGIN;
--   SET LOCAL app.current_org = 'org_abc123';   -- LOCAL = scoped to this transaction
--   SELECT * FROM leads;                         -- only org_abc123's leads are visible
--   INSERT INTO contacts (id, organization_id, full_name)
--     VALUES ('c_1', 'org_abc123', 'Jane Doe');  -- WITH CHECK enforces the org
--   COMMIT;
--
-- The application's tenant context sets `app.current_org` at the start of each
-- request-scoped transaction; `forTenant(prisma, orgId)` (src/tenant-middleware.ts)
-- is the application-layer companion that injects the same orgId into Prisma.
-- ─────────────────────────────────────────────────────────────────────────────
