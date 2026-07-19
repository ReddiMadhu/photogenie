"""
Celery Application — §5.5 / §5.9

Redis broker, task routing, retry configuration.
Concurrency: 2-4 ML tasks (GPU) or 1-2 (CPU).
"""

from __future__ import annotations

import os

from celery import Celery

celery_app = Celery(
    "photogenic",
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/1"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/2"),
    include=[
        "services.workers.tasks.ingest",
        "services.workers.tasks.erase",
        "services.workers.tasks.recluster",
    ],
)

celery_app.conf.update(
    # Task routing
    task_routes={
        "services.workers.tasks.ingest.*": {"queue": "ingest"},
        "services.workers.tasks.recluster.*": {"queue": "clustering"},
        "services.workers.tasks.erase.*": {"queue": "erasure"},
    },

    # Retry defaults
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,

    # Concurrency — do not unbounded-parallelize InsightFace sessions (§5.9)
    worker_concurrency=int(os.getenv("CELERY_CONCURRENCY", "2")),

    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Time limits
    task_time_limit=600,        # 10 min hard limit
    task_soft_time_limit=540,   # 9 min soft limit

    # Result expiry
    result_expires=3600,
)

# Auto-discover tasks
celery_app.autodiscover_tasks(["services.workers.tasks"])
