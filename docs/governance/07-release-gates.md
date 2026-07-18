# Release Gates — Phase 0 → Phase 1 Production

**Document ID:** GOV-GATE-001  
**Version:** 1.0.0-draft  
**Schema:** `packages/schemas/governance/release_gate_status.schema.json`  
**Enforcement:** Production services must load a signed gate bundle and refuse boot unless `overall_status == ready`.

## 1. Mandatory gates

| Gate ID | Title | Owner | Evidence |
|---|---|---|---|
| `dpia_signed` | DPIA / biometric impact assessment signed | Privacy | Signed GOV-DPIA-001 |
| `lawful_processing_approved` | Lawful processing, purposes, retention, prohibited use | Legal | Signed GOV-LP-001 + jurisdiction profiles |
| `model_commercial_license` | Commercial model rights + MBOM | Model Risk + Legal | Executed license + MBOM with `commercial_use_allowed: true` |
| `security_review` | Security controls + threat model | Security | Signed GOV-SEC-001 + GOV-TM-001 |
| `policy_schemas_published` | Machine-readable contracts published | Engineering | Schemas in repo + contract tests |
| `deletion_drill` | Deletion / restore journal drill | Security + Eng | Tabletop or technical drill record |
| `model_risk_report` | Accuracy / limitations report | Model Risk | Evaluation packet |
| `product_boundary_signoff` | Product boundary + prohibited-use UX | Product | Signed GOV-LP-001 §2 + UX checklist |

## 2. Overall status rules

```text
if any mandatory gate in {pending, in_review, rejected}: overall = blocked
else if any mandatory gate == waived: overall = blocked  # waivers not allowed for Phase 0 mandatory set
else if all mandatory == approved: overall = ready
```

Optional non-mandatory gates may be added later; they must not flip `ready` if mandatory incomplete.

## 3. Environments

| Environment | Gate bundle required? | Research weights allowed? |
|---|---|---|
| development | No | Yes, if MBOM marks non-commercial and data is synthetic/approved |
| test | No | Same as development |
| staging | Yes (`target_environment=staging`) | Prefer commercial; research only with Privacy exception |
| production | Yes (`target_environment=production`) | **No** |

## 4. Boot contract (normative for Phase 1+)

```text
if APP_ENV == production:
  load RELEASE_GATE_BUNDLE
  validate against release_gate_status.schema.json
  verify bundle signature
  require overall_status == ready
  require model MBOM commercial_use_allowed for detection+embedding
  else exit(2)
```

## 5. Change control

Material changes that re-open gates:

- New jurisdiction or population (e.g. minors)
- New purpose code
- New model_id / preprocess version
- New connector with different ACL semantics
- SEV1/SEV2 biometric incident

## 6. Current bootstrap status

See `config/governance/examples/release_gate_status.example.json`:

- `policy_schemas_published` = approved (schemas delivered in Phase 0 implementation)
- All other mandatory gates = pending human sign-off
- `overall_status` = **blocked**
