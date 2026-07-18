# Lawful Processing and Product Boundaries

**Document ID:** GOV-LP-001  
**Version:** 1.0.0-draft  
**Owners:** Legal, Privacy  
**Consumers:** Policy Service, Ingest API, Search API, Connector workers

## 1. Processing inventory

### 1.1 Data categories

| Category | Examples | Classification |
|---|---|---|
| Source images | Photos from Google Drive / future repos | Personal data; may contain special-category biometrics after processing |
| Face crops | Aligned 112×112 crops | Biometric-derived; minimize retention |
| Face landmarks / geometry | 5-point landmarks, bounding boxes | Biometric geometry / scan of face geometry |
| Face embeddings | ArcFace 512-D vectors | Biometric templates / identifiers |
| Quality scores | FIQA, blur, pose, face_px | Derived metadata; not identifiers alone |
| Repository metadata | Path, EXIF, ACL principals, timestamps | Personal / enterprise metadata |
| Audit evidence | Who searched whom, result IDs, policy decisions | Security / compliance logs |
| Query images | Uploaded probe faces | Biometric; short retention by default |

### 1.2 Populations in scope

| Population | Typical sources | Notes |
|---|---|---|
| Employees / contractors | Internal photo libraries, event photos | Employment-context consent or alternative lawful basis must be documented per jurisdiction |
| Customers / visitors | Marketing, event, facility photos | Explicit notice/consent often required |
| Public figures / third parties | Incidental faces in enterprise photos | Minimize; do not build identity dossiers without purpose |
| Minors | Any photos of children | Default **prohibited** unless jurisdiction profile explicitly allows with heightened controls |

### 1.3 Repository owners

Every indexed repository must declare:

- `repository_id`, `tenant_id`, `owner_principal`
- `data_steward`
- `source_system` (e.g. `google_drive`)
- `allowed_purpose_codes[]`
- `jurisdiction_tags[]`
- `sensitivity_tier` (`standard` | `restricted` | `highly_sensitive`)

## 2. Intended purposes (allowlist)

Purpose codes are enforced at API and workflow boundaries. Unknown purposes are denied.

| Purpose code | Description | Default allowed |
|---|---|---|
| `enterprise_photo_discovery` | Find images of a consenting/authorized subject for business records | Yes (with ACL) |
| `records_retrieval` | Locate historical enterprise photos for authorized business need | Yes |
| `security_investigation` | Investigation under documented legal hold / security procedure | Break-glass only |
| `hr_ops_authorized` | HR operations with documented authorization | Restricted |
| `model_evaluation` | Offline accuracy evaluation on approved holdout sets | Lab only |
| `product_demo` | Demo on synthetic/approved data | Non-prod |

### 2.1 Prohibited uses (hard deny)

The platform **must not** be used for:

1. Real-time public surveillance or continuous CCTV identity tracking
2. Emotion, race, political opinion, health, or religious inference products
3. Covert monitoring of employees without a documented lawful basis and notice
4. Sale, rental, or secondary monetization of biometric data
5. Building marketing lookalike audiences from face templates
6. Law-enforcement sharing without a formal legal request workflow and counsel approval
7. Processing knowingly involving minors unless jurisdiction profile and Legal approve
8. Cross-tenant search or “people search” across unauthorized repositories
9. Using query images for model training without separate approval
10. Re-identification of anonymized datasets using platform embeddings

## 3. Lawful basis and notice

### 3.1 Default posture

| Region family | Default posture | Notes |
|---|---|---|
| EU/EEA/UK (GDPR / UK GDPR) | Special-category biometric data → explicit consent **or** documented Art. 9 exception + DPIA | Prefer explicit consent for search features; employment necessity alone is insufficient without local counsel review |
| Illinois and similar US biometric states (BIPA-class) | Written notice + written release **before** collection; public retention schedule | Photographs alone are not always covered; **templates/geometry are** |
| Other US states with biometric / sensitive-data laws | Consent + notice per CPA/CTDPA/etc. sensitive-data rules | Map each state into jurisdiction profiles |
| Air-gapped / unknown | Deny biometric features until profile assigned | Fail closed |

### 3.2 Notice requirements (minimum)

Before first collection or first search enrollment for a data subject or population class, provide written notice of:

1. That biometric identifiers/templates will be collected or derived
2. Specific purpose and length of retention
3. Storage, access, and sharing practices
4. How to withdraw consent / request deletion
5. Contact for privacy requests

Capture evidence: notice version, timestamp, channel, accepting principal (where individual consent is used), or policy attestation (where alternative basis is used).

### 3.3 Consent / release states

Machine states for `subject_consent` or `population_authorization`:

| State | Meaning | Effect |
|---|---|---|
| `not_required` | Documented non-consent basis applies | Processing allowed under other controls |
| `pending` | Notice not completed | **Block** embedding persistence and search for that subject/population |
| `granted` | Valid consent/release on file | Allow within purpose/retention |
| `withdrawn` | Subject withdrew | Soft-suppress immediately; purge per retention rule |
| `expired` | Consent or authorization expired | Treat as withdrawn |
| `denied` | Explicit refusal | Hard deny |

## 4. Retention and destruction

### 4.1 Default retention schedule

| Artifact | Default retention | Destruction method |
|---|---|---|
| Source image references | Follow source system + enterprise records policy | Do not copy beyond need; object-store copies follow repo policy |
| Face crops | 30 days after embedding success **or** until legal hold | Cryptographic delete / overwrite per storage class |
| Face embeddings + landmarks | Until purpose satisfied **or** max **3 years** from last authorized interaction, whichever first (BIPA-aligned ceiling unless shorter policy applies) | Tombstone → physical purge from Milvus + DB + backups TTL |
| Query images | **24 hours** default; configurable ≤ 7 days | Auto-delete |
| Audit logs | **7 years** (security/compliance) unless local law requires longer | Immutable store; no biometric raw images in audit |
| Model evaluation sets | Per lab approval; separate from production | Isolated bucket |

### 4.2 Destruction triggers

Destroy or suppress when **any** of:

1. Initial purpose satisfied
2. Consent withdrawn / authorization expired
3. Retention max reached
4. Data-subject erasure request approved
5. Repository offboarding
6. Legal hold released **and** retention already expired

### 4.3 Legal hold

Legal hold **suspends** destruction but does **not** expand purpose. Held assets remain searchable only by authorized hold roles and purpose `security_investigation` or counsel-defined codes.

## 5. Data-subject and employee rights

| Right | Platform capability required |
|---|---|
| Access | Export metadata + face IDs + repositories where subject appears (authorized requester) |
| Deletion / erasure | Soft-suppress ≤ 60s; physical purge per policy; deletion journal; restore replay |
| Withdraw consent | Immediate search/index suppression |
| Restriction | Disable search while retaining under hold |
| Objection | Route to Privacy; default deny continued processing pending decision |
| Portability | JSON export of subject-linked face/asset references (not third-party photos wholesale) |

## 6. Jurisdiction and tenant kill-switches

Profiles may independently disable:

| Switch | Effect |
|---|---|
| `ingestion_enabled` | Connectors stop copying new assets |
| `embedding_enabled` | Vision workers skip biometric embedding |
| `search_enabled` | Face search APIs return 403 |
| `export_enabled` | Result download / bulk export blocked |
| `identity_naming_enabled` | No person labels / directory naming |
| `query_image_persist_enabled` | Query images never stored |

See [jurisdiction-profiles.md](jurisdiction-profiles.md).

## 7. Product boundary summary

**In scope for Phase 1:** authorized enterprise photo discovery within ACL’d repositories, with audited face-by-image search.

**Out of scope:** surveillance, emotion AI, demographic inference products, cross-org people search, training on customer biometrics without approval.

## 8. Acceptance for this document

- [ ] Legal review complete
- [ ] Privacy review complete
- [ ] Purpose code list approved
- [ ] Retention schedule published to affected employees/customers where required
- [ ] Jurisdiction profiles drafted for all launch regions
