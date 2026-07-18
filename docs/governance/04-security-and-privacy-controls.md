# Security and Privacy Controls

**Document ID:** GOV-SEC-001  
**Version:** 1.0.0-draft  
**Owners:** Security Architecture, Privacy Engineering  
**Consumers:** Policy Service, API Gateway, Index Controller, Platform Ops

## 1. Identity and access management

### 1.1 Identity

| Control | Requirement |
|---|---|
| Authentication | OIDC (enterprise IdP); no local password store for humans |
| Machine identity | Workload identity / mTLS between services |
| Provisioning | SCIM for users/groups; disable orphans within 24h |
| Session | Short-lived access tokens; refresh rotation; step-up for break-glass |

### 1.2 Roles (RBAC baseline)

| Role | Capabilities |
|---|---|
| `viewer` | Search within granted repositories + purposes |
| `analyst` | Search + view evidence panels |
| `data_steward` | Manage repository policy, ACL sync issues |
| `privacy_operator` | Consent, erasure, DSAR exports |
| `security_auditor` | Read audit logs; no face search by default |
| `admin` | Tenant configuration; no silent bypass of jurisdiction kill-switches |
| `break_glass` | Time-boxed elevated purpose; dual control |

Separation of duties: `admin` cannot clear audit logs; `privacy_operator` cannot disable audit; model deployers cannot approve their own MBOM in production.

### 1.3 ABAC attributes

Every authorization decision evaluates:

- `tenant_id`
- `repository_ids` / ACL principals
- `purpose_code`
- `jurisdiction_effective_policy`
- `sensitivity_tier`
- `legal_hold`
- `consent_state` (when subject-linked)
- `environment` (`development` \| `staging` \| `production`)

**Deny by default.** Missing attribute ⇒ deny.

### 1.4 Repository ACL inheritance

1. Connector projects source ACLs into `asset_acl` / `repository_acl`.
2. Search policy expands user groups → authorized repository/asset set.
3. Milvus filter **must** include tenant + authorized repos (or equivalent ACL token).
4. Post-rerank check repeats ACL + tombstone validation before response.

## 2. Encryption and key management

| Layer | Control |
|---|---|
| In transit | TLS 1.2+ everywhere; mTLS service mesh preferred |
| At rest — objects | SSE with envelope encryption |
| At rest — DB | Volume + column encryption for biometric fields where supported |
| At rest — vectors | Storage encryption + optional application-level encryption for embeddings |
| Keys | Per-tenant CMKs in Vault/HSM; annual rotation; emergency revoke |
| Secrets | No secrets in git; short-lived credentials for Drive connectors |
| Query images | Encrypted ephemeral store; TTL enforced by sweeper |

## 3. Data minimization

1. Prefer embedding + metadata over long-lived crops.
2. Pack/expire crops per retention.
3. Audit stores face IDs and score bands, **not** raw probe pixels (store probe hash only).
4. Logs redact embeddings and crop URLs by default.

## 4. Immutable audit

### 4.1 Mandatory audited actions

- Login / logout / step-up
- Face search request / response summary
- Result open / export / share
- ACL or policy change
- Consent grant/withdraw
- Deletion / legal hold
- Model/index generation change
- Break-glass activation
- Failed authorization

### 4.2 Audit properties

- Append-only store (WORM or hash-chained)
- Clock sync (NTP) required
- Retention ≥ 7 years unless law requires longer
- Access limited to `security_auditor` + Privacy under procedure

See audit schema: `packages/schemas/audit/audit_event.schema.json`.

## 5. Network and runtime

| Control | Requirement |
|---|---|
| Segmentation | Separate ingest, GPU, search, and data planes |
| Egress | Deny-by-default from GPU/search to Internet in air-gap; connector egress allowlist |
| Admission | Signed images + signed models only in production |
| Sandbox | Image decode in memory/CPU limits; zip-bomb guards |
| Rate limits | Per-user and per-tenant search quotas; anomaly detection on mass search |
| Backups | Encrypted; retention aligned with deletion journal replay |

## 6. Incident response (biometric-specific)

### 6.1 Severity

| Severity | Examples |
|---|---|
| SEV1 | Confirmed embedding DB exfiltration; cross-tenant ACL bypass in prod |
| SEV2 | Suspected insider mass search; deletion failure; ransomware on object store |
| SEV3 | Single unauthorized search; misconfigured jurisdiction profile caught before abuse |

### 6.2 Playbook hooks

1. Disable `search_enabled` / `embedding_enabled` via tenant or global kill-switch
2. Rotate tenant CMKs if key material suspected
3. Preserve audit + forensic snapshots
4. Notify Privacy/Legal within policy SLA (e.g. 24–72h regulatory clocks)
5. Offer subject notification when legally required
6. Post-incident: DPIA amendment + gate re-approval if material

## 7. Privacy UX requirements

- Purpose selection required on search UI (no silent default to break-glass)
- Jurisdiction banner when features disabled
- Clear “biometric processing” notice link
- Erasure request entry point for Privacy operators

## 8. Control mapping (abbreviated)

| Threat theme | Primary controls |
|---|---|
| Insider abuse | Purpose ABAC, quotas, audit, break-glass dual control |
| Cross-tenant leak | Tenant isolation, ANN filters, red-team tests |
| Embedding theft | Encryption, least privilege, egress control |
| Poison media | Decode sandbox, size limits, content-type allowlist |
| Stale cache | ACL hash in cache key; delete invalidation |
| Restore resurrection | Deletion journal replay before ready |
