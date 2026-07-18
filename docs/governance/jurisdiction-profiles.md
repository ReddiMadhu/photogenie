# Jurisdiction Profiles

**Document ID:** GOV-JUR-001  
**Version:** 1.0.0-draft  
**Schema:** `packages/schemas/policy/jurisdiction_profile.schema.json`

Profiles are evaluated at tenant bind time and on every search/ingest decision. **Fail closed** if no profile matches.

## Profile template fields

| Field | Description |
|---|---|
| `jurisdiction_id` | Stable ID, e.g. `us-il`, `eu-eea`, `us-default` |
| `display_name` | Human label |
| `biometric_notice_required` | Require published notice |
| `written_release_required` | BIPA-style written release |
| `max_retention_days` | Hard ceiling for embeddings |
| `ingestion_enabled` | Kill-switch |
| `embedding_enabled` | Kill-switch |
| `search_enabled` | Kill-switch |
| `export_enabled` | Kill-switch |
| `identity_naming_enabled` | Kill-switch |
| `minors_processing_allowed` | Default false |
| `allowed_purpose_codes` | Subset of global allowlist |
| `notes` | Counsel commentary |

## Baseline profiles (draft — counsel must confirm)

### `eu-eea`

```yaml
jurisdiction_id: eu-eea
display_name: EU/EEA GDPR
biometric_notice_required: true
written_release_required: false  # explicit consent or Art.9 basis documented instead
explicit_consent_preferred: true
max_retention_days: 1095
ingestion_enabled: true
embedding_enabled: true
search_enabled: true
export_enabled: true
identity_naming_enabled: true
minors_processing_allowed: false
allowed_purpose_codes:
  - enterprise_photo_discovery
  - records_retrieval
  - model_evaluation
notes: Special-category biometric data; DPIA mandatory; DPA consultation if residual high risk.
```

### `us-il`

```yaml
jurisdiction_id: us-il
display_name: Illinois BIPA
biometric_notice_required: true
written_release_required: true
max_retention_days: 1095  # purpose satisfied or 3 years from last interaction, whichever first
ingestion_enabled: true
embedding_enabled: true
search_enabled: true
export_enabled: true
identity_naming_enabled: true
minors_processing_allowed: false
allowed_purpose_codes:
  - enterprise_photo_discovery
  - records_retrieval
notes: Written policy must be publicly available before collection; no sale of biometrics.
```

### `us-default`

```yaml
jurisdiction_id: us-default
display_name: United States (baseline)
biometric_notice_required: true
written_release_required: false
max_retention_days: 1095
ingestion_enabled: true
embedding_enabled: true
search_enabled: true
export_enabled: true
identity_naming_enabled: true
minors_processing_allowed: false
allowed_purpose_codes:
  - enterprise_photo_discovery
  - records_retrieval
  - security_investigation
notes: Overlay state-specific profiles where stricter (e.g. us-il, us-tx, us-wa).
```

### `airgap-deny-default`

```yaml
jurisdiction_id: airgap-deny-default
display_name: Unassigned / fail-closed
biometric_notice_required: true
written_release_required: true
max_retention_days: 0
ingestion_enabled: false
embedding_enabled: false
search_enabled: false
export_enabled: false
identity_naming_enabled: false
minors_processing_allowed: false
allowed_purpose_codes: []
notes: Applied when tenant has no mapped jurisdiction.
```

## Assignment rules

1. Tenant declares one or more `jurisdiction_tags`.
2. Effective policy = intersection of all matched profiles (most restrictive wins per kill-switch).
3. Repository may further restrict purposes and sensitivity but cannot loosen jurisdiction ceilings.
4. Changes to profiles require Privacy + Legal approval and produce an audit event `policy.jurisdiction_updated`.
