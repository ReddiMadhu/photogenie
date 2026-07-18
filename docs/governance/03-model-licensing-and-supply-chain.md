# Model Licensing and Supply Chain

**Document ID:** GOV-ML-001  
**Version:** 1.0.0-draft  
**Owners:** Model Risk, Legal, Engineering  
**Schema:** `packages/schemas/policy/model_bom.schema.json`

## 1. Critical finding (blocker)

InsightFace source code is MIT-licensed, but **bundled / auto-downloaded pretrained models are for non-commercial research only** unless a separate commercial license is obtained from InsightFace.

**Production rule:** Services in `APP_ENV=production` must refuse to start if:

1. Model artifacts are missing from the approved model registry, or
2. MBOM entry lacks `commercial_use_allowed: true` with evidence URI, or
3. Checksum does not match the signed MBOM.

Silent download of research weights in production is a **release gate failure**.

## 2. Approved model classes for Phase 1

| Capability | Intended algorithm | Artifact source options | Status |
|---|---|---|---|
| Detection | RetinaFace (or licensed SCRFD A/B) | Commercial InsightFace pack **or** internally trained ONNX | Pending license |
| Alignment | InsightFace `norm_crop` (code) | MIT code path | Allowed |
| Embedding | ArcFace 512-D | Commercial pack **or** licensed/trained equivalent | Pending license |
| FIQA | SER-FIQ / CR-FIQA reference → productionized adapter | Verify each weight license before prod | Pending review |

## 3. Model Bill of Materials (MBOM) — required fields

Every deployable model file must have an MBOM record:

| Field | Description |
|---|---|
| `model_id` | Stable ID, e.g. `arcface-r100-512-v1` |
| `capability` | `detection` \| `embedding` \| `fiqa` \| `alignment_support` |
| `algorithm` | e.g. `RetinaFace`, `ArcFace` |
| `version` | Semver or vendor version |
| `filename` | Artifact name |
| `sha256` | Hex digest |
| `format` | `onnx` \| `engine` \| `other` |
| `license_spdx` | If applicable |
| `license_name` | Human license name |
| `commercial_use_allowed` | boolean |
| `license_evidence_uri` | Contract / email / portal evidence |
| `training_data_summary` | Known datasets / “vendor proprietary” |
| `training_data_restrictions` | Redistribution / biometric training constraints |
| `owner_team` | Accountable team |
| `approved_by` | Names/roles |
| `approved_at` | ISO-8601 |
| `expires_at` | Optional renewal date |
| `deployment_restrictions` | Air-gap only, no fine-tune, etc. |
| `evaluation_report_uri` | Accuracy / bias evaluation link |
| `signature` | Cosign/Sigstore or internal signing metadata |

## 4. Acquisition paths

### Path A — Commercial InsightFace (preferred if terms acceptable)

1. Contact InsightFace commercial licensing (recognition OSS pack / SDK as applicable).
2. Execute agreement covering production face recognition weights.
3. Obtain artifacts via approved channel (not public research auto-download).
4. Register MBOM + checksum + store in private model registry (MinIO/Vault-backed).
5. Sign artifacts; pin versions in deployment config.

### Path B — Train or procure ArcFace-compatible alternative

1. Train RetinaFace + ArcFace on licensed datasets **or** procure from a vendor with commercial terms.
2. Match preprocessing (`norm_crop`, 112×112, RGB order) for index compatibility.
3. Complete model-risk evaluation (TAR/FAR, subgroup/domain).
4. Register MBOM as in Path A.

### Path C — Development-only research weights

Allowed **only** when:

- `APP_ENV` ∈ {`development`, `test`}
- Data is synthetic or explicitly approved lab data
- MBOM marks `commercial_use_allowed: false`
- UI and APIs watermark “NON-PRODUCTION RESEARCH WEIGHTS”

## 5. Runtime enforcement

```text
startup:
  load MODEL_REGISTRY_MANIFEST
  for each required capability:
    resolve model_id + sha256
    verify signature
    verify commercial_use_allowed if APP_ENV=production
    verify file checksum
  refuse boot on any failure
```

Workers must embed `model_id` + `preprocess_version` into every face record and Milvus payload. Mixing generations in one collection is forbidden.

## 6. SBOM and dependency licensing

| Control | Requirement |
|---|---|
| Container SBOM | Generate SPDX/CycloneDX per image in CI |
| Language deps | Pin versions; license scan (MIT/Apache/BSD OK; copyleft review) |
| GPU runtimes | Track CUDA/TensorRT/ORT licenses |
| Vulnerability policy | Block critical CVEs without exception ticket |
| Signed images | Cosign/Notary; admission control in prod clusters |

## 7. Evaluation and model risk

Before production approval of any embedding/detection MBOM:

1. TAR @ FAR = 1e-3 / 1e-4 on enterprise-like holdout
2. Detection recall by face-size bucket
3. Domain split: camera / repository / lighting
4. Documented known failure modes (profile, occlusion, kids if any)
5. Change-management plan for model upgrades (shadow index, dual-write)

## 8. Evidence checklist

- [ ] Commercial license executed **or** alternative model approved
- [ ] MBOM entries for detection + embedding (+ FIQA if used)
- [ ] Checksums and signatures verified in staging
- [ ] Production boot-refusal test passes with missing/invalid MBOM
- [ ] SBOM attached to release candidate
- [ ] Model-risk evaluation report filed

## 9. Contacts (fill in)

| Vendor / role | Contact | Notes |
|---|---|---|
| InsightFace commercial | recognition-oss-pack@insightface.ai / contact@insightface.ai | Verify current contacts at contract time |
| Internal Model Risk | _TBD_ | |
| Internal Legal — IP | _TBD_ | |
