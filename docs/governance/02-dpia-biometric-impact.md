# DPIA / Biometric Impact Assessment

**Document ID:** GOV-DPIA-001  
**Version:** 1.0.0-draft  
**Regulation anchors:** GDPR Art. 9 / Art. 35; UK GDPR; BIPA-class US laws; enterprise biometric policy  
**Status:** Template — must be completed with organization-specific facts before production

## 1. Summary

| Field | Value |
|---|---|
| System | Enterprise Face Search Platform (PhotoGenic) |
| Processing | Derive face embeddings from enterprise repository images; search by probe image |
| High risk? | **Yes** — large-scale biometric template processing |
| Residual risk after controls | Medium (target: Low–Medium with Phase 0–1 controls) |
| DPO / Privacy lead | _TBD_ |
| Review cadence | Annual or on material change |

## 2. Description of processing

### 2.1 Nature

- Automated detection of faces in enterprise photos
- Generation of biometric templates (ArcFace embeddings)
- Similarity search returning images where a person may appear
- Audit of searches and administrative actions

### 2.2 Scope

- Volume target: up to 100M images / ~1B face crops (design capacity)
- Phase 1 launch: limited repositories and tenants (define exact counts before go-live)
- Retention: see GOV-LP-001
- Geographic storage: self-hosted / air-gappable; no default third-country transfer

### 2.3 Context

- Users: authorized enterprise employees with repository ACLs
- Subjects: employees, contractors, incidental third parties in photos
- Power imbalance: employer–employee context requires heightened scrutiny

## 3. Necessity and proportionality

| Question | Assessment |
|---|---|
| Is face search necessary for the stated purposes? | Yes for discovery across large unstructured photo corpora; alternatives (manual tagging) do not scale |
| Can the purpose be achieved with less data? | Prefer templates over long-lived crops; short query retention; ACL minimization |
| Is continuous monitoring involved? | **No** — query-driven search only; CCTV streaming is prohibited |
| Are special-category inferences produced? | Platform must **not** infer race, emotion, health, religion |

## 4. Risks to individuals

| Risk ID | Risk | Likelihood | Impact | Mitigations |
|---|---|---|---|---|
| R1 | Unauthorized identity search by insider | Medium | High | ABAC purpose codes, audit, break-glass, anomaly alerts |
| R2 | Cross-tenant / ACL bypass via vector search | Medium | Critical | Mandatory filters in ANN + post-filter; red-team tests |
| R3 | Embedding database breach | Low–Medium | Critical | Encryption at rest, tenant keys, network isolation, least privilege |
| R4 | Function creep (HR surveillance) | Medium | High | Purpose allowlist; prohibited-use policy; product controls |
| R5 | Incorrect match harms reputation | Medium | High | Quality gating, thresholds, explainability, human review for high-risk actions |
| R6 | Processing without notice/consent | Medium | Critical | Consent states; jurisdiction kill-switches |
| R7 | Failure to erase (backup resurrection) | Medium | High | Deletion journal; restore replay; backup TTL |
| R8 | Model license / unlawful training data provenance | Low–Medium | High | Commercial MBOM; no silent research-weight download in prod |
| R9 | Demographic performance disparity | Medium | High | Holdout evaluation by domain; monitoring; documented limitations |
| R10 | Minor subject processing | Low | Critical | Default deny; detection heuristics + policy |

## 5. Consultation

| Stakeholder | Consulted? | Date | Outcome |
|---|---|---|---|
| DPO / Privacy | _TBD_ | | |
| Legal | _TBD_ | | |
| Security | _TBD_ | | |
| Works council / employee reps (if required) | _TBD_ | | |
| Model Risk | _TBD_ | | |
| Repository data stewards | _TBD_ | | |

## 6. Residual risk decision

After implementing Phase 0 controls and Phase 1 technical gates:

- Residual risk is accepted only with signed [09-approval-matrix.md](09-approval-matrix.md)
- Any expansion to new jurisdictions, populations (e.g. minors), or purposes requires DPIA amendment

## 7. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Privacy / DPO | | | |
| Legal | | | |
| Security | | | |
| Product Owner | | | |
| Model Risk | | | |
