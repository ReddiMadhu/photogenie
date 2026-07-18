# Approval Matrix and Evidence Package

**Document ID:** GOV-APR-001  
**Version:** 1.0.0-draft  
**Owner:** Product (coordinator)  
**Blocks:** Phase 1 production rollout

## 1. Approval matrix

| Gate / artifact | Legal | Privacy | Security | Model Risk | Product | Engineering |
|---|---|---|---|---|---|---|
| Lawful processing (GOV-LP-001) | **Sign** | **Sign** | Consult | Consult | **Sign** | Consult |
| DPIA (GOV-DPIA-001) | Consult | **Sign** | Consult | Consult | Consult | Consult |
| Jurisdiction profiles | **Sign** | **Sign** | Consult | — | Consult | Implement |
| Model commercial license + MBOM | **Sign** | Consult | Consult | **Sign** | Consult | Implement |
| Security controls (GOV-SEC-001) | Consult | Consult | **Sign** | Consult | Consult | Implement |
| Threat model (GOV-TM-001) | Consult | Consult | **Sign** | Consult | Consult | Consult |
| Policy/audit schemas | Consult | Consult | Consult | Consult | Consult | **Sign** |
| Release gates bundle | **Sign** | **Sign** | **Sign** | **Sign** | **Sign** | **Sign** |
| Tabletop exercises | Consult | **Sign** | **Sign** | Consult | Consult | Consult |

## 2. Evidence package checklist

Place completed evidence under an access-controlled store (not necessarily public git):

```text
evidence/phase0/
  dpiA-signed.pdf
  lawful-processing-signed.pdf
  jurisdiction-approvals/
  model-license/
    agreement.pdf
    mbom-detection.json
    mbom-embedding.json
  security-review/
    controls-signed.pdf
    threat-model-signed.pdf
  tabletops/
    A-breach-notes.md
    B-erasure-notes.md
    C-hold-notes.md
    D-admin-notes.md
    E-restore-notes.md
  release_gate_status.signed.json
```

Repository-tracked drafts and schemas live under `docs/governance/`, `packages/schemas/`, and `config/governance/examples/`.

## 3. Sign-off block

| Role | Name | Date | Signature / attestation |
|---|---|---|---|
| Legal | | | |
| Privacy / DPO | | | |
| Security | | | |
| Model Risk | | | |
| Product Owner | | | |
| Engineering Lead | | | |

## 4. Engineering attestation (Phase 0 deliverables)

The following were delivered in-repo as the Phase 0 implementation:

- [x] Governance document set under `docs/governance/`
- [x] JSON Schemas under `packages/schemas/`
- [x] Example policy/audit/gate instances under `config/governance/examples/`
- [x] Release gate list with production boot contract
- [x] Tabletop exercise scripts
- [ ] Human signatures (organizational — pending)
- [ ] Commercial model license (organizational — pending)
- [ ] Executed TTX outcomes (organizational — pending)

**Production remains BLOCKED until organizational signatures flip `release_gate_status.overall_status` to `ready`.**
