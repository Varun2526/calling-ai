# Runbook NNNN — <Short Incident Title>

> **Template usage:** copy this file to `docs/runbooks/NNNN-<slug>.md` (NNNN = next sequential number),
> fill every section, and link it from the triggering CloudWatch alarm and from
> [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md). Keep it terse and command-driven — this is read at 3am.
> Commands describe the **intended/target** procedures while the platform is at the architecture stage.

---

## Metadata

| Field                 | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| **Runbook ID**        | NNNN                                                                               |
| **Title**             | <what this incident is>                                                            |
| **Severity**          | Sev-1 / Sev-2 / Sev-3 (default; IC may raise) — see severity guide below           |
| **Owner**             | <team — e.g. Platform / Voice / DevOps> (CODEOWNERS for the affected service)      |
| **Affected services** | `apps/api` / `apps/voice-gateway` / `apps/workers` / `apps/web` / RDS / Redis / S3 |
| **Last reviewed**     | YYYY-MM-DD                                                                         |
| **Related**           | links to other runbooks, ADRs, dashboards                                          |

**Severity quick guide:** Sev-1 = data loss, full outage of a core service, or **any cross-tenant data
exposure** (always Sev-1). Sev-2 = major degradation, partial outage, SLO breach. Sev-3 = minor/contained.

---

## 1. Summary

One or two sentences: what is happening, what's the user-visible effect, and the single most likely cause.

## 2. Detection / Alerts

- **Triggering alarm(s):** <CloudWatch alarm name(s) + threshold> → routes to <PagerDuty/Slack>.
- **Other signals:** Sentry issue pattern, dashboard panel, customer report.
- **How to confirm it's really this incident** (vs. a similar-looking one): <quick discriminating check>.

## 3. Impact

- **Who/what is affected:** which tenants (one vs. all — group by `organizationId`), which features.
- **Severity rationale:** why this severity; what makes it escalate.
- **SLO/budget at risk:** e.g. text reply < 2s p95, voice turn < 1.2s p95 (`ARCHITECTURE.md` §13).

## 4. Diagnosis Steps

Numbered, copy-pasteable. Start broad, narrow down. Reference
[`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) §1 for log locations and correlation-id tracing.

1. Check <metric/dashboard> to confirm scope and trend.
2. Pull recent logs for the affected service (filter by `organizationId` / `correlationId`).
3. Check Sentry for the error pattern + whether it began at a deploy (release SHA).
4. Check the relevant pipeline stage (outbox → BullMQ → handler, §1.3 of TROUBLESHOOTING).
5. Check third-party provider status + quota if external dependency suspected.
6. Conclude: root cause hypothesis.

## 5. Mitigation / Remediation Steps

Ordered fastest-safe-relief first, then durable fix.

1. **Immediate relief:** <scale out / shed load / flip feature flag / pause queue>.
2. **Stop the bleeding:** <isolate poison job / throttle / reroute>.
3. **Durable fix:** <root-cause remediation>.
4. **Verify recovery:** <metric back under threshold, smoke check, customer confirmation>.

## 6. Rollback

- If a **deploy** caused it: redeploy the previous **digest / task-def revision**
  (`DEPLOYMENT_GUIDE.md` §8). App rollback needs no schema change (expand–contract, §4.2).
- If a **migration** is implicated: prefer **roll forward** with a corrective migration; restore from the
  pre-migration RDS snapshot only as a last resort (§4.4 / §9).
- State the explicit rollback command/button and the last-known-good reference to use.

## 7. Communication

- **Internal:** declare incident, open channel, assign Incident Commander; update on a fixed cadence.
- **Escalation:** who to page if not resolved within <N min> (TROUBLESHOOTING §5).
- **External / customer status** (if Sev-1/Sev-2 and customer-visible): who posts, where, what cadence.
- **Resolution notice:** post all-clear when verified.

## 8. Post-Incident Actions

- [ ] Blameless post-incident review scheduled; timeline reconstructed via `correlationId`.
- [ ] Root cause documented; corrective/preventive actions filed as tracked issues with owners.
- [ ] Alarms/dashboards tuned (thresholds, missing signals).
- [ ] This runbook updated with anything learned; new symptom added to TROUBLESHOOTING §2.
- [ ] Tests/guardrails added to prevent regression (e.g. CI check, cross-tenant test).
