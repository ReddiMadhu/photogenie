"""
Face Quality Scoring Service — §3.6

Wrapper around packages/vision/quality.py for the ML inference service.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from packages.vision.quality import QualityReport, assess_quality

logger = logging.getLogger(__name__)


def score_face_quality(
    face_crop: np.ndarray,
    det_score: float,
    face_bbox: Optional[list[int]] = None,
    image_shape: Optional[tuple[int, int]] = None,
    embedding_raw: Optional[np.ndarray] = None,
) -> QualityReport:
    """
    Score face quality using CR-FIQA-style assessment.

    This is the capability none of the 4 reference projects have (§3.6).
    They only use det_score. We add sharpness, brightness, contrast,
    face size, and embedding norm for comprehensive quality gating.
    """
    return assess_quality(
        face_crop=face_crop,
        det_score=det_score,
        face_bbox=face_bbox,
        image_shape=image_shape,
        embedding_raw=embedding_raw,
    )
