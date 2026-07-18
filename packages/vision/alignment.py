"""
Face Alignment — §3.4 / §5.5

5-point Umeyama similarity transform to the canonical 112×112 ArcFace template.
Stores the alignment transform per face for explainability overlays (§3.4).
"""

from __future__ import annotations

from typing import Optional

import cv2
import numpy as np


# Canonical ArcFace 112×112 template (5-point landmarks)
# From InsightFace: insightface/utils/face_align.py
ARCFACE_TEMPLATE_112 = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float64)


def estimate_similarity_transform(
    src_pts: np.ndarray,
    dst_pts: np.ndarray,
) -> np.ndarray:
    """
    Umeyama similarity estimate: rotation + scale + translation.

    Args:
        src_pts: (N, 2) source landmarks
        dst_pts: (N, 2) destination landmarks

    Returns:
        (2, 3) affine transform matrix
    """
    num = src_pts.shape[0]
    dim = src_pts.shape[1]

    src_mean = src_pts.mean(axis=0)
    dst_mean = dst_pts.mean(axis=0)

    src_demean = src_pts - src_mean
    dst_demean = dst_pts - dst_mean

    A = dst_demean.T @ src_demean / num
    d = np.ones(dim)

    if np.linalg.det(A) < 0:
        d[dim - 1] = -1

    T = np.eye(dim + 1)

    U, S, Vt = np.linalg.svd(A)

    rank = np.linalg.matrix_rank(A)
    if rank == 0:
        return np.eye(2, 3)

    if rank == dim - 1:
        if np.linalg.det(U) * np.linalg.det(Vt) > 0:
            T[:dim, :dim] = U @ Vt
        else:
            d[dim - 1] = -1
            T[:dim, :dim] = U @ np.diag(d) @ Vt
    else:
        T[:dim, :dim] = U @ np.diag(d) @ Vt

    src_var = src_demean.var(axis=0).sum()
    scale = 1.0 / src_var * (S @ d)

    T[:dim, dim] = dst_mean - scale * (T[:dim, :dim] @ src_mean)
    T[:dim, :dim] *= scale

    return T[:2, :]


def norm_crop(
    img: np.ndarray,
    landmarks: np.ndarray,
    image_size: int = 112,
    template: Optional[np.ndarray] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Align and crop a face using 5-point landmarks → canonical template.

    Args:
        img: BGR image (H, W, 3)
        landmarks: (5, 2) facial landmarks (left_eye, right_eye, nose,
                   left_mouth, right_mouth)
        image_size: output size (default 112 for ArcFace)
        template: optional custom template; defaults to ARCFACE_TEMPLATE_112

    Returns:
        (aligned_face, transform_matrix)
        - aligned_face: (image_size, image_size, 3) BGR
        - transform_matrix: (2, 3) float64 — store per face for explainability
    """
    if template is None:
        template = ARCFACE_TEMPLATE_112

    # Scale template if image_size != 112
    if image_size != 112:
        scale = image_size / 112.0
        dst = template * scale
    else:
        dst = template

    src = np.array(landmarks, dtype=np.float64).reshape(5, 2)

    M = estimate_similarity_transform(src, dst)

    aligned = cv2.warpAffine(
        img, M, (image_size, image_size), borderValue=0.0
    )

    return aligned, M


def inverse_transform(
    M: np.ndarray,
    points: np.ndarray,
) -> np.ndarray:
    """
    Map points from aligned space back to original image space.
    Useful for explainability overlays.

    Args:
        M: (2, 3) forward transform from norm_crop
        points: (N, 2) points in aligned space

    Returns:
        (N, 2) points in original image space
    """
    # Build 3x3 matrix
    M_full = np.eye(3)
    M_full[:2, :] = M

    M_inv = np.linalg.inv(M_full)

    pts_h = np.hstack([points, np.ones((points.shape[0], 1))])
    result = (M_inv @ pts_h.T).T

    return result[:, :2]
