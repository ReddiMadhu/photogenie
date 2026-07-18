"""
Face Quality Assessment — §3.6

CR-FIQA-style quality estimation. None of the 4 reference projects
(Immich, PhotoPrism, DeepFace, InsightFace) have this — they only use
det_score. Quality gates, aggregation weights, representative-crop
selection, and explainability all depend on this score.

Approach: embedding robustness (SER-FIQ principle) + image-level heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np


@dataclass
class QualityReport:
    """Quality assessment for a single face crop."""
    overall: float          # 0.0 (worst) to 1.0 (best)
    sharpness: float        # Laplacian variance
    brightness: float       # mean luminance normalized
    contrast: float         # std of luminance
    face_size: float        # normalized face size (px / image diagonal)
    det_score: float        # detector confidence pass-through
    embedding_norm: Optional[float] = None  # L2 norm before normalization


def assess_quality(
    face_crop: np.ndarray,
    det_score: float,
    face_bbox: Optional[list[int]] = None,
    image_shape: Optional[tuple[int, int]] = None,
    embedding_raw: Optional[np.ndarray] = None,
) -> QualityReport:
    """
    Compute a composite quality score for a face crop.

    The overall score is a weighted combination of:
    - Sharpness (Laplacian variance) — filters blurry faces
    - Brightness — filters too dark / too bright
    - Contrast — filters washed-out faces
    - Face size — penalizes very small faces
    - Detection confidence — higher is better
    - Embedding norm stability — CR-FIQA proxy

    Args:
        face_crop: aligned face crop (H, W, 3) BGR
        det_score: detector confidence [0, 1]
        face_bbox: [x, y, w, h] in original image (optional)
        image_shape: (H, W) of original image (optional)
        embedding_raw: raw embedding before L2 normalization (optional)

    Returns:
        QualityReport with component scores and overall quality
    """
    gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop

    # Sharpness: Laplacian variance (higher = sharper)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    # Normalize: typical range [0, 2000+], cap at 500
    sharpness = min(laplacian_var / 500.0, 1.0)

    # Brightness: mean of grayscale, optimal around 127
    mean_brightness = gray.mean() / 255.0
    brightness = 1.0 - abs(mean_brightness - 0.5) * 2.0  # 1.0 at 127, 0.0 at 0 or 255

    # Contrast: std of grayscale
    contrast_val = gray.std() / 128.0  # normalize
    contrast = min(contrast_val, 1.0)

    # Face size relative to image
    face_size = 1.0
    if face_bbox is not None and image_shape is not None:
        _, _, bw, bh = face_bbox
        img_h, img_w = image_shape[:2]
        diagonal = np.sqrt(img_w**2 + img_h**2)
        face_diag = np.sqrt(bw**2 + bh**2)
        face_size = min(face_diag / diagonal * 5.0, 1.0)  # scale up

    # Embedding norm (CR-FIQA proxy)
    embedding_norm = 1.0
    if embedding_raw is not None:
        norm = float(np.linalg.norm(embedding_raw))
        # Higher norm before L2-normalization correlates with quality
        embedding_norm = min(norm / 25.0, 1.0)  # typical norms 15-30

    # Weighted combination
    overall = (
        0.30 * sharpness
        + 0.10 * brightness
        + 0.10 * contrast
        + 0.15 * face_size
        + 0.15 * det_score
        + 0.20 * embedding_norm
    )

    return QualityReport(
        overall=round(max(0.0, min(1.0, overall)), 4),
        sharpness=round(sharpness, 4),
        brightness=round(brightness, 4),
        contrast=round(contrast, 4),
        face_size=round(face_size, 4),
        det_score=round(det_score, 4),
        embedding_norm=round(embedding_norm, 4) if embedding_raw is not None else None,
    )


def filter_by_quality(
    faces: list[dict],
    quality_floor: float = 0.3,
) -> list[dict]:
    """
    Gate faces by quality score. Faces below the floor are excluded
    from indexing (§5.5: `if f.quality < QUALITY_FLOOR: continue`).

    Args:
        faces: list of face dicts with 'quality' key
        quality_floor: minimum quality threshold

    Returns:
        list of faces passing the quality gate
    """
    return [f for f in faces if f.get("quality", 0) >= quality_floor]


def select_representative(
    faces: list[dict],
) -> Optional[dict]:
    """
    Select the best-quality face as the representative for a person.
    Used for person thumbnails and centroid weighting.
    """
    if not faces:
        return None
    return max(faces, key=lambda f: f.get("quality", 0))
