# Schemas Package

Machine-readable contracts for PhotoGenic governance and (later) runtime services.

## Layout

```text
packages/schemas/
  policy/
    purpose_codes.schema.json
    jurisdiction_profile.schema.json
    retention_rule.schema.json
    tenant_policy.schema.json
    model_bom.schema.json
  audit/
    audit_event.schema.json
  governance/
    release_gate_status.schema.json
```

## Examples

See `config/governance/examples/`.

## Validation

Use any Draft 2020-12 JSON Schema validator in CI. A helper script is provided at `scripts/governance/validate_examples.py`.

```bash
python scripts/governance/validate_examples.py
```

## Rules

1. Production policy documents must validate before publish.
2. Unknown fields are rejected (`additionalProperties: false` on core envelopes).
3. Breaking changes require a new `$id` version path.
