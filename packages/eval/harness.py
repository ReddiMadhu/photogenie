"""
Evaluation Harness — §5.11

Load labeled sets per group, run the search pipeline, compute all KPIs,
and report pass/fail against thresholds.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from packages.eval.metrics import (
    DETCurve,
    EvalMetrics,
    cluster_purity,
    compute_det_curve,
    fnmr_at_fmr,
    recall_at_k,
)


# §5.11 KPI Thresholds (Phase 2 targets)
KPI_THRESHOLDS = {
    "recall_at_50": 0.95,
    "cluster_purity": 0.98,
    "search_latency_p95_ms": 100.0,
    "search_latency_p99_ms": 200.0,
    "small_face_improvement": 0.25,  # +25% over baseline
}


@dataclass
class EvalResult:
    """Result of running the evaluation harness."""
    group_id: str
    metrics: EvalMetrics
    passed: bool
    failures: list[str]


def load_labeled_set(path: Path) -> dict:
    """
    Load a frozen labeled test set for a group.

    Expected format:
    {
        "group_id": "...",
        "pairs": [
            {"query": "face_id_1", "candidate": "face_id_2", "label": true},
            ...
        ],
        "queries": [
            {"face_id": "...", "expected_person": "person_A"},
            ...
        ],
        "ground_truth_faces": [
            {"x": 10, "y": 20, "w": 50, "h": 60, "person": "person_A"},
            ...
        ]
    }
    """
    with open(path) as f:
        return json.load(f)


def run_evaluation(
    labeled_set: dict,
    search_fn=None,
    cluster_fn=None,
) -> EvalResult:
    """
    Run the full evaluation harness against a labeled set.

    In production, search_fn and cluster_fn would call the actual
    retrieval and identity services. For CI gates, they use recorded
    embeddings and cached results.
    """
    group_id = labeled_set.get("group_id", "unknown")
    failures = []

    # Placeholder metrics — filled by actual service calls in production
    metrics = EvalMetrics(
        recall_at_k={50: 0.0},
        fnmr_at_fmr={1e-3: 0.0},
        cluster_purity=0.0,
        cluster_count=0,
        singleton_count=0,
        det_curve=DETCurve(fmr=[], fnmr=[], thresholds=[]),
        search_latency_p95_ms=0.0,
        search_latency_p99_ms=0.0,
    )

    # Check against thresholds
    for kpi, threshold in KPI_THRESHOLDS.items():
        if kpi == "recall_at_50":
            actual = metrics.recall_at_k.get(50, 0.0)
            if actual < threshold:
                failures.append(f"recall@50 = {actual:.3f} < {threshold}")
        elif kpi == "cluster_purity":
            if metrics.cluster_purity < threshold:
                failures.append(
                    f"cluster_purity = {metrics.cluster_purity:.3f} < {threshold}"
                )
        elif kpi == "search_latency_p95_ms":
            if metrics.search_latency_p95_ms > threshold:
                failures.append(
                    f"p95_latency = {metrics.search_latency_p95_ms:.1f}ms > {threshold}ms"
                )
        elif kpi == "search_latency_p99_ms":
            if metrics.search_latency_p99_ms > threshold:
                failures.append(
                    f"p99_latency = {metrics.search_latency_p99_ms:.1f}ms > {threshold}ms"
                )

    return EvalResult(
        group_id=group_id,
        metrics=metrics,
        passed=len(failures) == 0,
        failures=failures,
    )
