"""
Re-clustering Task — §5.6

Triggers HDBSCAN re-clustering on the Identity service for a specific group.
Scheduled + on-demand, always one group at a time.
"""

from __future__ import annotations

import logging
import os

import httpx

from services.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

IDENTITY_SERVICE_URL = os.getenv("IDENTITY_SERVICE_URL", "http://identity:8002")


@celery_app.task(bind=True, max_retries=3, name="recluster.run")
def recluster_group(self, tenant_id: str, group_id: str, min_cluster_size: int = 2) -> dict:
    """Trigger HDBSCAN re-clustering for a group via the Identity service."""
    try:
        with httpx.Client(timeout=300.0) as client:
            resp = client.post(
                f"{IDENTITY_SERVICE_URL}/cluster",
                json={
                    "tenant_id": tenant_id,
                    "group_id": group_id,
                    "min_cluster_size": min_cluster_size,
                },
            )
            resp.raise_for_status()
            result = resp.json()
            logger.info(f"Recluster group {group_id}: {result}")
            return result
    except Exception as e:
        logger.error(f"Recluster failed for group {group_id}: {e}")
        raise self.retry(exc=e)
