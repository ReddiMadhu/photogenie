# Model Upgrade Playbook — §5.14

## Overview
Model upgrades (e.g., ArcFace R50 → R100, buffalo_l → antelopev2) require
careful handling to avoid blind reprocessing and maintain recall parity.

## Steps

### 1. Shadow Index
1. Create a new Qdrant collection `faces_v2` with the new model's dimensions
2. Run the new model against a labeled pilot group
3. Both `faces_v1` and `faces_v2` are populated simultaneously

### 2. Recall Parity Gate
1. Run `packages/eval/harness.py` against the pilot group with both models
2. Compare DET curves, recall@50, cluster purity
3. **Gate**: new model must match or exceed old model on all KPIs
4. If failed → abort migration, keep v1

### 3. Switchover
1. Update `model_id` and `model_version` in env/config
2. Run re-embedding task for all groups (via Celery)
3. Each face gets new embedding in `faces_v2`; old `faces_v1` retained
4. Switch retrieval service to query `faces_v2`
5. After validation period (1 week): drop `faces_v1`

### 4. Rollback
1. Switch retrieval back to `faces_v1`
2. Drop `faces_v2`
3. Revert config

## Embedding Versioning
Every face record has `model_id` and `model_version` fields.
Every Qdrant point has `model_version` in its payload.
This allows mixed-model queries during migration.
