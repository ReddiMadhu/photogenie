"""
Celery Application — §5.5 / §5.9

Redis broker, task routing, retry configuration, Beat schedule.
"""

from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

celery_app = Celery(
    "photogenic",
    broker=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/1"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/2"),
    include=[
        "services.workers.tasks.ingest",
        "services.workers.tasks.erase",
        "services.workers.tasks.recluster",
        "services.workers.tasks.sync_connectors",
    ],
)

celery_app.conf.update(
    task_routes={
        "services.workers.tasks.ingest.*": {"queue": "ingest"},
        "services.workers.tasks.recluster.*": {"queue": "clustering"},
        "services.workers.tasks.erase.*": {"queue": "erasure"},
        "connectors.*": {"queue": "ingest"},
    },
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_concurrency=int(os.getenv("CELERY_CONCURRENCY", "2")),
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_time_limit=600,
    task_soft_time_limit=540,
    result_expires=3600,
    beat_schedule={
        "sync-gdrive-every-15-min": {
            "task": "connectors.sync_all_gdrive",
            "schedule": crontab(minute="*/15"),
        },
    },
)

celery_app.autodiscover_tasks(["services.workers.tasks"])
