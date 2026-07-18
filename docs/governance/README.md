# Phase 0 — Governance and Release Gates

**Status:** Draft for Legal / Privacy / Security / Model Risk / Product approval  
**Platform:** Enterprise Face Search (PhotoGenic)  
**Constraint:** No production biometric processing until all mandatory release gates are signed.

## Purpose

Phase 0 converts architecture and regulatory requirements into:

1. Human-readable policy (this directory)
2. Machine-readable contracts (`packages/schemas/policy/`, `packages/schemas/audit/`)
3. An evidence package and approval matrix that block Phase 1 production rollout

## Document map

| Document | Owner | Description |
|---|---|---|
| [01-lawful-processing.md](01-lawful-processing.md) | Legal + Privacy | Jurisdictions, purposes, consent, retention, deletion, prohibited use |
| [02-dpia-biometric-impact.md](02-dpia-biometric-impact.md) | Privacy | DPIA / biometric impact assessment template and residual risks |
| [03-model-licensing-and-supply-chain.md](03-model-licensing-and-supply-chain.md) | Model Risk + Legal | InsightFace/commercial weights, MBOM, SBOM, signed artifacts |
| [04-security-and-privacy-controls.md](04-security-and-privacy-controls.md) | Security | Identity, ACL/ABAC, encryption, audit, incident response |
| [05-threat-model.md](05-threat-model.md) | Security | STRIDE-style threats for face search |
| [06-policy-and-audit-contracts.md](06-policy-and-audit-contracts.md) | Engineering + Privacy | How services consume policy/audit schemas |
| [07-release-gates.md](07-release-gates.md) | Product + Security | Mandatory gates before Phase 1 production |
| [08-tabletop-exercises.md](08-tabletop-exercises.md) | Security + Privacy | Breach, consent withdrawal, legal hold, malicious admin, restore |
| [09-approval-matrix.md](09-approval-matrix.md) | Product | Sign-off owners and evidence checklist |
| [jurisdiction-profiles.md](jurisdiction-profiles.md) | Privacy | Per-jurisdiction kill-switches and defaults |

## Machine-readable contracts

| Path | Purpose |
|---|---|
| `packages/schemas/policy/tenant_policy.schema.json` | Tenant-level biometric policy |
| `packages/schemas/policy/jurisdiction_profile.schema.json` | Jurisdiction kill-switches |
| `packages/schemas/policy/purpose_codes.schema.json` | Allowed purpose codes |
| `packages/schemas/policy/retention_rule.schema.json` | Retention / destruction |
| `packages/schemas/policy/model_bom.schema.json` | Model bill of materials |
| `packages/schemas/audit/audit_event.schema.json` | Immutable audit event envelope |
| `packages/schemas/governance/release_gate_status.schema.json` | Gate status tracking |
| `config/governance/examples/` | Example policy instances for local/dev |

## Hard rules

1. Development may use **synthetic faces** or **explicitly approved** test corpora only.
2. Services must refuse to start in `production` mode without a signed release-gate bundle.
3. InsightFace pretrained weights are **non-commercial by default** until commercial rights are documented in the MBOM.
4. Embeddings and face geometry are treated as **biometric identifiers** under BIPA-style definitions and GDPR special-category data where applicable.
