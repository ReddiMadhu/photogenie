"""
Evaluation Metrics — §5.11

DET/ROC curve computation, FNMR@FMR, recall@k, cluster purity.
Non-negotiable from day 1.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class DETCurve:
    """Detection Error Tradeoff curve."""
    fmr: list[float]   # False Match Rate
    fnmr: list[float]  # False Non-Match Rate
    thresholds: list[float]


@dataclass
class EvalMetrics:
    """Full evaluation metrics for a group."""
    recall_at_k: dict[int, float]      # {k: recall}
    fnmr_at_fmr: dict[float, float]    # {fmr_target: fnmr}
    cluster_purity: float
    cluster_count: int
    singleton_count: int
    det_curve: DETCurve
    search_latency_p95_ms: float
    search_latency_p99_ms: float


def compute_det_curve(
    genuine_scores: np.ndarray,
    impostor_scores: np.ndarray,
    num_thresholds: int = 1000,
) -> DETCurve:
    """
    Compute DET curve from genuine and impostor similarity scores.

    Args:
        genuine_scores: cosine similarities for same-person pairs
        impostor_scores: cosine similarities for different-person pairs
        num_thresholds: number of threshold steps

    Returns:
        DETCurve with FMR, FNMR arrays and thresholds
    """
    all_scores = np.concatenate([genuine_scores, impostor_scores])
    thresholds = np.linspace(all_scores.min(), all_scores.max(), num_thresholds)

    fmr_list = []
    fnmr_list = []

    for tau in thresholds:
        # FMR: fraction of impostor pairs scoring above threshold
        fmr = float(np.mean(impostor_scores >= tau))
        # FNMR: fraction of genuine pairs scoring below threshold
        fnmr = float(np.mean(genuine_scores < tau))
        fmr_list.append(fmr)
        fnmr_list.append(fnmr)

    return DETCurve(
        fmr=fmr_list,
        fnmr=fnmr_list,
        thresholds=thresholds.tolist(),
    )


def fnmr_at_fmr(det: DETCurve, target_fmr: float) -> float:
    """
    Find FNMR at a specific FMR operating point.

    §5.11: "FNMR @ FMR=1e-3, per group, calibrated"
    """
    for i, fmr in enumerate(det.fmr):
        if fmr <= target_fmr:
            return det.fnmr[i]
    return det.fnmr[-1]


def recall_at_k(
    query_labels: list[str],
    result_labels: list[list[str]],
    k: int,
) -> float:
    """
    Compute recall@k: fraction of queries where the correct person
    appears in the top-k results.

    §5.11 target: "Search recall@50 ≥ 0.95"
    """
    if not query_labels:
        return 0.0

    hits = 0
    for query, results in zip(query_labels, result_labels):
        top_k = results[:k]
        if query in top_k:
            hits += 1

    return hits / len(query_labels)


def cluster_purity(
    cluster_labels: list[str],
    true_labels: list[str],
) -> float:
    """
    Compute cluster purity: fraction of faces correctly clustered.

    §5.11 target: "Cluster purity ≥ 0.98"
    """
    if not cluster_labels:
        return 0.0

    from collections import Counter

    clusters: dict[str, list[str]] = {}
    for cl, tl in zip(cluster_labels, true_labels):
        clusters.setdefault(cl, []).append(tl)

    total_correct = 0
    for members in clusters.values():
        counts = Counter(members)
        total_correct += counts.most_common(1)[0][1]

    return total_correct / len(cluster_labels)


def small_face_recall(
    detections_baseline: list[dict],
    detections_sahi: list[dict],
    ground_truth: list[dict],
    max_face_px: int = 64,
    iou_threshold: float = 0.5,
) -> dict[str, float]:
    """
    Compare small-face detection recall between baseline (single-scale)
    and SAHI-tiled detection.

    §5.11 target: "Small-face (<64px) detection recall ≥ +25%"
    """
    small_gt = [g for g in ground_truth if min(g.get("w", 0), g.get("h", 0)) < max_face_px]

    if not small_gt:
        return {"baseline": 0.0, "sahi": 0.0, "improvement": 0.0}

    def _recall(dets):
        hits = 0
        for gt in small_gt:
            for d in dets:
                if _iou_xywh(gt, d) >= iou_threshold:
                    hits += 1
                    break
        return hits / len(small_gt)

    baseline_recall = _recall(detections_baseline)
    sahi_recall = _recall(detections_sahi)

    improvement = (sahi_recall - baseline_recall) / max(baseline_recall, 1e-6)

    return {
        "baseline": baseline_recall,
        "sahi": sahi_recall,
        "improvement": improvement,
    }


def _iou_xywh(a: dict, b: dict) -> float:
    """IoU between two {x, y, w, h} dicts."""
    ax, ay, aw, ah = a["x"], a["y"], a["w"], a["h"]
    bx, by, bw, bh = b.get("bbox_x", b.get("x", 0)), b.get("bbox_y", b.get("y", 0)), \
                      b.get("bbox_w", b.get("w", 0)), b.get("bbox_h", b.get("h", 0))

    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)

    inter = max(0, x2 - x1) * max(0, y2 - y1)
    union = aw * ah + bw * bh - inter

    return inter / union if union > 0 else 0.0
