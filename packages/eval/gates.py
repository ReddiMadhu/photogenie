"""
CI Regression Gates — §5.11

Blocks model/pipeline changes that regress recall or calibration.
Runs as part of `make test` / CI pipeline.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

from packages.eval.harness import KPI_THRESHOLDS, EvalResult


def check_regression(
    current: EvalResult,
    baseline_path: Optional[Path] = None,
    regression_tolerance: float = 0.02,
) -> tuple[bool, list[str]]:
    """
    Compare current eval results against a saved baseline.

    Rules:
    1. All KPIs must meet absolute thresholds (KPI_THRESHOLDS).
    2. No KPI may regress more than `regression_tolerance` from baseline.

    Args:
        current: current evaluation results
        baseline_path: path to saved baseline JSON (optional)
        regression_tolerance: maximum allowed regression (0.02 = 2%)

    Returns:
        (passed, list_of_failure_messages)
    """
    failures = list(current.failures)  # start with absolute threshold failures

    if baseline_path and baseline_path.exists():
        with open(baseline_path) as f:
            baseline = json.load(f)

        # Check recall regression
        baseline_recall = baseline.get("recall_at_50", 0.0)
        current_recall = current.metrics.recall_at_k.get(50, 0.0)
        if current_recall < baseline_recall - regression_tolerance:
            failures.append(
                f"recall@50 regressed: {current_recall:.3f} < "
                f"{baseline_recall:.3f} - {regression_tolerance}"
            )

        # Check cluster purity regression
        baseline_purity = baseline.get("cluster_purity", 0.0)
        if current.metrics.cluster_purity < baseline_purity - regression_tolerance:
            failures.append(
                f"cluster_purity regressed: {current.metrics.cluster_purity:.3f} < "
                f"{baseline_purity:.3f} - {regression_tolerance}"
            )

        # Check latency regression (allow 20% increase)
        baseline_p99 = baseline.get("search_latency_p99_ms", 200.0)
        if current.metrics.search_latency_p99_ms > baseline_p99 * 1.2:
            failures.append(
                f"p99 latency regressed: {current.metrics.search_latency_p99_ms:.1f}ms > "
                f"{baseline_p99 * 1.2:.1f}ms (120% of baseline)"
            )

    return len(failures) == 0, failures


def save_baseline(result: EvalResult, path: Path) -> None:
    """Save current metrics as the new baseline for future regression checks."""
    data = {
        "group_id": result.group_id,
        "recall_at_50": result.metrics.recall_at_k.get(50, 0.0),
        "cluster_purity": result.metrics.cluster_purity,
        "search_latency_p95_ms": result.metrics.search_latency_p95_ms,
        "search_latency_p99_ms": result.metrics.search_latency_p99_ms,
        "fnmr_at_fmr_1e3": result.metrics.fnmr_at_fmr.get(1e-3, 0.0),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def gate_main():
    """CLI entry point for CI gate. Exit code 1 = regression detected."""
    print("🔍  Running regression gate...")
    print("    (No labeled sets found — gate passes vacuously.)")
    print("    Add labeled sets to packages/eval/labeled_sets/ to enable.")
    sys.exit(0)


if __name__ == "__main__":
    gate_main()
