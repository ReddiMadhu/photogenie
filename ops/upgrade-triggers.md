# Upgrade Triggers — §5.14

Promote a deferred component **only when a measured condition holds** for 2+ weeks
(or a hard SLA breach).

## Trigger Table

| Trigger | Metric to Monitor | Component to Add |
|---|---|---|
| Aggregate face vectors > ~5M **or** Qdrant RSS > 70% of host RAM | Platform-wide vector count / `docker stats` memory | Qdrant cluster **or** Milvus; consider SQ8 + oversample-rescore |
| Sustained ingest > ~50 img/s across groups **or** Celery lag p95 > 15 min | `celery inspect active`, queue depth in Redis | Kafka (or Redpanda) event bus; consider Temporal for long workflows |
| Concurrent interactive queries p99 > 300 ms under load | API latency monitoring | Redis result cache tuning, Qdrant replicas, then horizontal API |
| OCR + caption + filename search volume hurts Postgres **or** complex facets needed | Postgres `pg_stat_statements`, slow query log | OpenSearch/Elasticsearch sidecar |
| > 2 GPU workers needed, multi-model batching, or HA ML SLA | GPU utilization, queue depth | Triton + TensorRT; K8s + KEDA on queue depth |
| Single group or merged graph > ~500K faces with HDBSCAN quality/time failure | Recluster wall time, cluster purity | STAR-FC (or sharded clustering research) |
| Multi-hop "who appears with whom across events" is a sold feature | Product requirement | Postgres recursive CTEs first; Neo4j only if CTE latency fails |
| Multi-region residency / regulated HA | Contractual | Per-region stacks; tenant key management; then K8s |

## How to Monitor

```bash
# Vector count
curl http://localhost:6333/collections/faces_v1 | jq '.result.points_count'

# Celery queue depth
redis-cli -n 1 LLEN ingest

# API latency
curl -w "%{time_total}" http://localhost:8000/health

# Postgres slow queries
docker exec postgres psql -U photogenic -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

## Decision

Until these triggers fire, the lean Compose architecture is the correct answer
for a 15K-per-group product. Spend engineering on retrieval quality and isolation,
not on distributed scaffolding.
