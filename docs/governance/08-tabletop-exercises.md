# Governance Tabletop Exercises

**Document ID:** GOV-TTX-001  
**Version:** 1.0.0-draft  
**Owners:** Security, Privacy, Legal, Engineering, Product  
**Cadence:** Before first production launch; annually after material change or SEV1/SEV2

These exercises satisfy the Phase 0 validation todo. Record outcomes in the evidence package referenced by [09-approval-matrix.md](09-approval-matrix.md).

---

## Exercise A — Biometric template breach

### Scenario
A security alert indicates unauthorized read access to the Milvus volume containing face embeddings for Tenant Example.

### Injects
1. Attacker may have copied 2M embeddings.
2. Audit shows anomalous service account usage.
3. Press / employee rumor starts internally.

### Discussion questions
- Who can flip `search_enabled` / `embedding_enabled` kill-switches?
- Are tenant CMKs rotatable without destroying backups incorrectly?
- What is the regulatory notification clock (GDPR 72h / state laws)?
- Do we notify subjects? Who drafts language?
- How do we distinguish embedding theft from source-image theft impact?

### Expected controls exercised
- Kill-switches, key rotation, audit preservation, Legal/Privacy notification, DPIA amendment trigger

### Pass criteria
- [ ] Named on-call roles and escalation path documented
- [ ] Kill-switch procedure executable in < 15 minutes
- [ ] Notification decision tree agreed
- [ ] Evidence captured for post-incident review

### Result (fill during TTX)
| Field | Value |
|---|---|
| Date | |
| Facilitator | |
| Participants | |
| Outcome | pass / fail / conditional |
| Actions | |

---

## Exercise B — Withdrawal of consent / erasure

### Scenario
An employee in an Illinois-tagged population withdraws written release and requests deletion of biometric templates derived from corporate event photos.

### Injects
1. Subject appears in 12,000 faces across 3 repositories.
2. One repository is under legal hold for unrelated litigation.
3. Backups from last night still contain embeddings.

### Discussion questions
- Soft-suppress SLA (target ≤ 60s) — who verifies?
- How does legal hold interact with erasure?
- How are backups handled (TTL vs active purge)?
- What is returned to the subject in the DSAR response?

### Expected controls exercised
- Consent state machine, deletion journal, hold exception, Privacy operator role

### Pass criteria
- [ ] Soft-suppress path clear
- [ ] Hold vs erase conflict resolved per counsel
- [ ] Backup/restore resurrection addressed
- [ ] Subject communication template drafted

### Result
| Field | Value |
|---|---|
| Date | |
| Outcome | pass / fail / conditional |
| Actions | |

---

## Exercise C — Litigation hold

### Scenario
Counsel issues a legal hold covering Repository `marketing-events-2024` including face embeddings and audit logs.

### Injects
1. Retention sweeper is about to purge crops older than 30 days.
2. A steward requests repository offboarding.
3. An analyst wants to run face search for `records_retrieval`.

### Discussion questions
- Who can apply/release holds?
- Does hold expand search purpose? (**No**)
- Are sweeper jobs hold-aware?
- What audit evidence proves hold enforcement?

### Pass criteria
- [ ] Hold blocks destruction
- [ ] Purpose still constrained
- [ ] Offboarding blocked or hold-aware
- [ ] Audit events defined

### Result
| Field | Value |
|---|---|
| Date | |
| Outcome | pass / fail / conditional |
| Actions | |

---

## Exercise D — Malicious / curious administrator search

### Scenario
A platform admin attempts to search for a colleague using purpose `security_investigation` without break-glass approval.

### Injects
1. Admin tries to disable audit “temporarily.”
2. Admin exports results to CSV.
3. Admin changes tenant jurisdiction profile to loosen controls.

### Discussion questions
- Are purpose checks server-side only?
- Can admin disable audit?
- Dual control for break-glass?
- Alerts on mass search / config changes?

### Pass criteria
- [ ] Unauthorized purpose denied and audited
- [ ] Audit cannot be disabled by same actor unilaterally
- [ ] Export constrained
- [ ] Policy change requires approval + audit

### Result
| Field | Value |
|---|---|
| Date | |
| Outcome | pass / fail / conditional |
| Actions | |

---

## Exercise E — Cross-region / air-gap restore

### Scenario
Disaster recovery restores PostgreSQL + Milvus + MinIO from Day N-1 backups into a clean cluster. Several subjects were erased on Day N-1 afternoon after backup.

### Injects
1. Engineers want to mark cluster ready immediately.
2. Deletion journal is available as a separate durable stream.
3. A user searches and receives a previously erased face hit.

### Discussion questions
- What is the ready predicate?
- Order of replay for deletion journal?
- How to detect divergence between Postgres and Milvus after restore?
- Who signs readiness after DR?

### Pass criteria
- [ ] Documented restore runbook requires journal replay before ready
- [ ] Reconciliation job defined
- [ ] Acceptance test case listed for Phase 1
- [ ] No erased face searchable after successful drill path

### Result
| Field | Value |
|---|---|
| Date | |
| Outcome | pass / fail / conditional |
| Actions | |

---

## Consolidated TTX sign-off

| Exercise | Outcome | Date | Facilitator |
|---|---|---|---|
| A Breach | pending | | |
| B Consent/erasure | pending | | |
| C Legal hold | pending | | |
| D Malicious admin | pending | | |
| E Restore | pending | | |

Phase 0 governance validation is **procedurally complete** when packages and scripts exist; **organizationally complete** only when the table above is filled with pass/conditional outcomes and actions tracked.
