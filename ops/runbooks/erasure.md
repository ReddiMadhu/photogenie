# Erasure Playbook — §5.13

## Overview
Erasure of a person or asset must complete ≤24h with audit proof (§5.11 KPI).

## Triggers
- User requests `DELETE /v1/groups/{id}/persons/{pid}` or `DELETE /v1/groups/{id}/assets/{aid}`
- GDPR erasure request (Article 17)
- BIPA/CUBI compliance action

## Steps

### 1. Enqueue Erasure Task
The API endpoint enqueues a Celery task (`erase.person` or asset-level equivalent).

### 2. Vector Deletion
- Delete all Qdrant points matching `person_id` (or `asset_id`)
- Use `delete` with point IDs from the `faces.embedding_id` column

### 3. Database Cleanup
- Delete face records from `faces` table
- Delete person record from `persons` table
- Record `person_events` with kind='erase'
- Record `audit_log` entry

### 4. Cache Purge
- Delete Redis cache keys: `person:{group_id}:{person_id}`, `search_cache:{group_id}`

### 5. Object Store (Phase 3)
- Delete face crop images from MinIO
- If crypto-shredding is enabled: destroy the per-person encryption key

### 6. Audit Proof
- `audit_log` entry with: tenant_id, user_id, action='erase', resource, details
- `person_events` entry with kind='erase', payload includes counts
- Both are immutable, append-only

## Verification
- Query Qdrant for erased person_id → must return 0 results
- Query `faces` table → must return 0 rows
- Query `persons` table → must return 0 rows
- `audit_log` must have the erasure entry
- Total time from request to completion ≤ 24 hours
