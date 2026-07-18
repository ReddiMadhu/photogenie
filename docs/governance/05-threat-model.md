# Threat Model — Enterprise Face Search

**Document ID:** GOV-TM-001  
**Version:** 1.0.0-draft  
**Method:** STRIDE-inspired, asset-centric  
**Owners:** Security Architecture

## 1. Assets

| Asset | Sensitivity |
|---|---|
| Source images in object store | High |
| Face crops | High |
| Face embeddings (biometric templates) | Critical |
| ACL / policy configuration | High |
| Audit logs | High |
| Model weights | High (IP + integrity) |
| Connector credentials (Drive) | Critical |
| Query images | High |
| Tenant encryption keys | Critical |

## 2. Trust boundaries

```text
[End User Browser] --TLS--> [API Gateway]
[API Gateway] --mTLS--> [Search | Policy | Ingest]
[Connectors] --egress allowlist--> [Google Drive]
[Vision Workers] --internal--> [MinIO | Postgres | Milvus]
[Admin] --IdP step-up--> [Control Plane]
[Backups] --offline/airgap policy--> [Restore path]
```

## 3. Threat catalog

| ID | Category | Threat | Attack path | Mitigations | Test |
|---|---|---|---|---|---|
| T1 | Spoofing | Stolen OIDC token used for search | Session theft | Short TTL, binding, anomaly detection | Token replay test |
| T2 | Spoofing | Forged service identity writes vectors | Compromised worker | mTLS, workload identity, signed images | Unauthorized upsert denied |
| T3 | Tampering | Modified ArcFace weights backdoor | Supply-chain | Signed MBOM, checksum, admission | Boot fails on bad digest |
| T4 | Tampering | ACL row altered to broaden access | Malicious admin / SQLi | Audit, least privilege, parameterized SQL, approvals | ACL change audited |
| T5 | Repudiation | User denies mass search | Insider | Immutable audit with query hash + result IDs | Auditor can reconstruct |
| T6 | Info disclosure | ANN returns other-tenant faces | Missing filter | Mandatory tenant+ACL filter + post-check | Cross-tenant red team |
| T7 | Info disclosure | Embedding export via debug API | Misconfig | No embedding export in prod APIs; role deny | API contract test |
| T8 | Info disclosure | Logs print embeddings/URLs | Verbose logging | Redaction middleware | Log scan CI |
| T9 | DoS | Decompression bomb | Malicious image | Pixel/byte limits, timeouts | Bomb fixture rejected |
| T10 | DoS | GPU queue starvation | Burst uploads | Quotas, separate pools | Chaos load test |
| T11 | Elevation | Viewer triggers break-glass purpose | UI abuse | Server-side purpose allowlist + dual control | 403 on unauthorized purpose |
| T12 | Elevation | Restore brings back erased biometrics | Backup restore | Deletion journal replay before ready | Restore drill |
| T13 | Spoofing | Photo-of-photo enrollment | Untrusted upload | Optional PAD later; quality gates; purpose limits | Document residual risk |
| T14 | Tampering | Stale CDN/cache shows deleted face | Cache | Tombstone + cache key with delete generation | Delete then query |
| T15 | Info disclosure | Model card / error leaks internal paths | Verbose errors | Safe error envelopes | Fuzz API errors |

## 4. Abuse cases (product)

1. Manager searches all employees without legitimate purpose  
2. HR builds attendance dossier from event photos without notice  
3. Contractor exports face hits off-platform  
4. Admin disables audit “temporarily”  
5. Operator runs production research weights to “save time”

Each abuse case must fail closed via policy + audit + gate.

## 5. Residual risks accepted only with sign-off

- Determined attackers with full admin + backup access  
- Physical capture of HSM material  
- Novel biometric template inversion research (monitor literature; no raw crop retention reduces impact)

## 6. Review cadence

- Update on architecture change, new connector, new jurisdiction, or SEV1/SEV2 incident  
- Annual full review minimum
