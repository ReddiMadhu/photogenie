# Policy and Audit Contracts

**Document ID:** GOV-CTR-001  
**Version:** 1.0.0-draft  
**Owners:** Privacy Engineering, Platform Engineering

## 1. How services consume policy

| Service | Reads | Enforces |
|---|---|---|
| `policy-service` | All policy schemas | Authorization decisions |
| `ingest-api` / connectors | jurisdiction, retention, ingestion kill-switch | Skip/copy/delete behavior |
| `vision-worker` | embedding kill-switch, MBOM, retention for crops | Refuse embed; pin models |
| `search-api` | search kill-switch, purposes, ACL inputs | 403 / filtered search |
| `index-controller` | deletion, legal hold, generations | Tombstones / purge |
| Bootstrapping | `release_gate_status` | Refuse `production` boot if gates incomplete |

## 2. Schema index

| Schema | Path |
|---|---|
| Tenant policy | `packages/schemas/policy/tenant_policy.schema.json` |
| Jurisdiction profile | `packages/schemas/policy/jurisdiction_profile.schema.json` |
| Purpose codes | `packages/schemas/policy/purpose_codes.schema.json` |
| Retention rule | `packages/schemas/policy/retention_rule.schema.json` |
| Model BOM | `packages/schemas/policy/model_bom.schema.json` |
| Audit event | `packages/schemas/audit/audit_event.schema.json` |
| Release gate status | `packages/schemas/governance/release_gate_status.schema.json` |

## 3. Versioning rules

1. Schemas use `$id` URIs under `https://photogenic.local/schemas/...`
2. Additive optional fields are minor versions; breaking changes require new major `$id`
3. Stored policy documents include `schema_version`
4. Unknown purpose codes ⇒ deny
5. Policy updates emit audit `policy.updated`

## 4. Decision response shape (normative)

```json
{
  "allow": false,
  "reason_codes": ["jurisdiction_search_disabled", "purpose_not_allowed"],
  "effective_policy_hash": "sha256:...",
  "tenant_id": "...",
  "purpose_code": "enterprise_photo_discovery"
}
```

Search and ingest APIs must persist `effective_policy_hash` on audit events.

## 5. Examples

See `config/governance/examples/` for valid instances used in local development and contract tests.
