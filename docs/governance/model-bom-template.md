# Model Bill of Materials — Template Instance

Replace placeholders after license acquisition. This file is an example shape for `config/governance/examples/model_bom.example.json`.

## Required production models

| model_id | capability | commercial_use_allowed | sha256 | status |
|---|---|---|---|---|
| `retinaface-r50-pending` | detection | false | pending | BLOCKED |
| `arcface-r100-512-pending` | embedding | false | pending | BLOCKED |
| `fiqa-serfiq-pending` | fiqa | false | pending | BLOCKED for prod |

## Registry layout (object store)

```text
models/
  detection/
    retinaface/
      <version>/
        model.onnx
        model.onnx.sha256
        mbom.json
        mbom.json.sig
  embedding/
    arcface/
      <version>/
        model.onnx
        ...
  fiqa/
    ...
```

## Signing

- Prefer keyless Sigstore/cosign where network policy allows, else internal HSM-backed signing keys.
- Admission: only signed digests referenced by the release-gate bundle may be mounted into GPU workers.
