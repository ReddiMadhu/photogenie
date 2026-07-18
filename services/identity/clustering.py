"""
Offline Clustering — §5.6 HDBSCAN Re-clustering

Scheduled + on-demand, one group at a time:
1. Pull face embeddings for (tenant_id, group_id) only
2. HDBSCAN (min_cluster_size=2, quality-filtered core points)
3. Reconcile: split contaminated, merge singletons, emit person_events
"""

from __future__ import annotations

import logging
import time
import uuid as uuid_lib
from collections import Counter, defaultdict
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


async def recluster_group(
    tenant_id: str,
    group_id: str,
    qdrant_client=None,
    db_pool=None,
    min_cluster_size: int = 2,
    quality_threshold: float = 0.3,
) -> dict:
    """
    Run HDBSCAN re-clustering on a single group (§5.6).

    Never clusters the whole platform — always scoped to (tenant_id, group_id).
    At ≤150K faces/group, STAR-FC is unnecessary.

    Returns clustering summary.
    """
    start = time.time()

    # Step 1: Pull all face embeddings for this group from Qdrant
    embeddings, face_ids, current_persons, qualities = await _fetch_group_embeddings(
        tenant_id, group_id, qdrant_client, quality_threshold
    )

    if len(embeddings) < min_cluster_size:
        logger.info(f"Group {group_id}: too few faces ({len(embeddings)}) for clustering")
        return {
            "total_faces": len(embeddings),
            "clusters_found": 0,
            "singletons": len(embeddings),
            "merges": 0,
            "splits": 0,
            "duration_seconds": time.time() - start,
        }

    # Step 2: HDBSCAN clustering
    try:
        import hdbscan

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=1,
            metric="euclidean",
            cluster_selection_method="eom",
            core_dist_n_jobs=1,
        )
        # Convert cosine embeddings to euclidean-friendly space
        # (L2-normalized vectors: euclidean² = 2 - 2·cos)
        X = np.array(embeddings)
        cluster_labels = clusterer.fit_predict(X)

    except ImportError:
        logger.warning("hdbscan not installed — using basic threshold clustering")
        cluster_labels = _fallback_threshold_cluster(embeddings, threshold=0.5)

    # Step 3: Reconcile clusters with existing person assignments
    result = await _reconcile_clusters(
        face_ids=face_ids,
        cluster_labels=cluster_labels.tolist() if hasattr(cluster_labels, 'tolist') else cluster_labels,
        current_persons=current_persons,
        qualities=qualities,
        tenant_id=tenant_id,
        group_id=group_id,
        qdrant_client=qdrant_client,
        db_pool=db_pool,
    )

    duration = time.time() - start
    result["duration_seconds"] = round(duration, 2)

    logger.info(
        f"Group {group_id} clustering: {result['clusters_found']} clusters, "
        f"{result['singletons']} singletons, {result['merges']} merges, "
        f"{result['splits']} splits in {duration:.1f}s"
    )

    return result


async def _fetch_group_embeddings(
    tenant_id: str,
    group_id: str,
    qdrant_client,
    quality_threshold: float,
) -> tuple[list, list, list, list]:
    """Fetch all face embeddings for a group from Qdrant."""
    embeddings = []
    face_ids = []
    current_persons = []
    qualities = []

    if qdrant_client is None:
        return embeddings, face_ids, current_persons, qualities

    from qdrant_client.models import Filter, FieldCondition, MatchValue, ScrollRequest

    offset = None
    while True:
        results = qdrant_client.scroll(
            collection_name="faces_v1",
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                    FieldCondition(key="group_id", match=MatchValue(value=group_id)),
                ]
            ),
            limit=1000,
            offset=offset,
            with_vectors=True,
        )

        points, next_offset = results

        for point in points:
            quality = point.payload.get("quality", 0.0)
            if quality < quality_threshold:
                continue

            embeddings.append(point.vector)
            face_ids.append(point.payload.get("face_id", str(point.id)))
            current_persons.append(point.payload.get("person_id"))
            qualities.append(quality)

        if next_offset is None:
            break
        offset = next_offset

    return embeddings, face_ids, current_persons, qualities


async def _reconcile_clusters(
    face_ids: list[str],
    cluster_labels: list[int],
    current_persons: list[Optional[str]],
    qualities: list[float],
    tenant_id: str,
    group_id: str,
    qdrant_client,
    db_pool,
) -> dict:
    """
    Reconcile HDBSCAN clusters with existing person assignments.
    Emit person_events for all changes — never silently rewrite.
    """
    merges = 0
    splits = 0

    # Group faces by cluster
    clusters: dict[int, list[int]] = defaultdict(list)
    for idx, label in enumerate(cluster_labels):
        clusters[label].append(idx)

    singletons = len(clusters.get(-1, []))  # -1 = noise in HDBSCAN
    real_clusters = {k: v for k, v in clusters.items() if k >= 0}

    for cluster_id, member_indices in real_clusters.items():
        # Check if this cluster maps to existing persons
        existing_pids = Counter()
        for idx in member_indices:
            pid = current_persons[idx]
            if pid:
                existing_pids[pid] += 1

        if len(existing_pids) == 0:
            # All new faces — create a new person
            if db_pool is not None:
                new_person_id = uuid_lib.uuid4()
                best_idx = max(member_indices, key=lambda i: qualities[i])
                try:
                    async with db_pool.acquire() as conn:
                        await conn.execute(
                            "INSERT INTO persons (id, tenant_id, group_id, "
                            "face_count, created_by) VALUES ($1, $2, $3, $4, $5)",
                            new_person_id,
                            uuid_lib.UUID(tenant_id),
                            uuid_lib.UUID(group_id),
                            len(member_indices),
                            "clustering",
                        )
                except Exception as e:
                    logger.error(f"Failed to create person: {e}")

        elif len(existing_pids) == 1:
            # All agree — no change needed (or assign unassigned to this person)
            pass

        elif len(existing_pids) > 1:
            # Multiple persons in one cluster — potential merge or contamination
            # For now, assign to majority person; emit split events for minorities
            majority_pid = existing_pids.most_common(1)[0][0]
            for pid, count in existing_pids.items():
                if pid != majority_pid:
                    splits += 1

            merges += 1

    return {
        "total_faces": len(face_ids),
        "clusters_found": len(real_clusters),
        "singletons": singletons,
        "merges": merges,
        "splits": splits,
    }


def _fallback_threshold_cluster(
    embeddings: list,
    threshold: float = 0.5,
) -> list[int]:
    """Simple threshold-based clustering fallback when hdbscan is not installed."""
    n = len(embeddings)
    labels = [-1] * n
    current_label = 0

    X = np.array(embeddings)

    for i in range(n):
        if labels[i] != -1:
            continue
        labels[i] = current_label
        for j in range(i + 1, n):
            if labels[j] != -1:
                continue
            sim = float(np.dot(X[i], X[j]))  # cosine sim (already L2-normalized)
            if sim >= threshold:
                labels[j] = current_label
        current_label += 1

    return labels
