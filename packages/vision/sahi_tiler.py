"""
SAHI Tiling for Face Detection — §3.3 / §5.5

Slicing Aided Hyper Inference: overlap-tiled detection for recovering small
faces in high-resolution group photos. This is the capability none of the
4 reference projects (Immich, PhotoPrism, DeepFace, InsightFace) implement.

The tiler generates overlapping crops at native resolution, each sized for
the detector's input. Detections are mapped back to original coordinates,
then cross-tile duplicates are removed via NMS.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class TileSpec:
    """One tile in the SAHI grid."""
    x_offset: int
    y_offset: int
    tile_w: int
    tile_h: int
    scale: float = 1.0  # resize factor applied to the crop

    def offset_bbox(self, bbox: list[int]) -> list[int]:
        """Map a bbox from tile coords to original image coords."""
        x, y, w, h = bbox
        return [
            int(x / self.scale + self.x_offset),
            int(y / self.scale + self.y_offset),
            int(w / self.scale),
            int(h / self.scale),
        ]

    def offset_landmarks(self, kps: np.ndarray) -> np.ndarray:
        """Map 5-point landmarks from tile coords to original coords."""
        result = kps.copy().astype(float)
        result[:, 0] = result[:, 0] / self.scale + self.x_offset
        result[:, 1] = result[:, 1] / self.scale + self.y_offset
        return result


@dataclass
class SAHIConfig:
    """Configuration for SAHI tiling."""
    det_size: int = 640          # detector input size
    min_face_px: int = 20       # minimum face size in original pixels
    overlap_ratio: float = 0.25  # overlap between tiles (0-1)
    max_tiles: int = 20          # cap to avoid OOM on huge images
    include_full: bool = True    # also run detection on full (resized) image


def compute_tiles(
    img_h: int,
    img_w: int,
    config: Optional[SAHIConfig] = None,
) -> list[TileSpec]:
    """
    Compute overlap tiles for the given image dimensions.

    Strategy:
    1. If image is small enough for the detector, return a single tile.
    2. Otherwise, compute a grid of overlapping tiles at native resolution.
    3. Optionally include a full-image pass at reduced resolution.

    Returns list of TileSpec, each defining a crop region.
    """
    if config is None:
        config = SAHIConfig()

    tiles: list[TileSpec] = []

    # If image fits in the detector input, just one tile
    if img_h <= config.det_size and img_w <= config.det_size:
        tiles.append(TileSpec(
            x_offset=0, y_offset=0,
            tile_w=img_w, tile_h=img_h,
            scale=1.0,
        ))
        return tiles

    # Full-image pass at reduced resolution (catches large faces)
    if config.include_full:
        scale = config.det_size / max(img_h, img_w)
        tiles.append(TileSpec(
            x_offset=0, y_offset=0,
            tile_w=img_w, tile_h=img_h,
            scale=scale,
        ))

    # Tiled passes at native resolution (catches small faces)
    tile_size = config.det_size
    stride = int(tile_size * (1.0 - config.overlap_ratio))
    if stride <= 0:
        stride = tile_size

    n_cols = max(1, math.ceil((img_w - tile_size) / stride) + 1)
    n_rows = max(1, math.ceil((img_h - tile_size) / stride) + 1)

    # Cap total tiles
    total = n_cols * n_rows
    if total > config.max_tiles:
        # Increase stride to reduce tile count
        target_per_dim = int(math.sqrt(config.max_tiles))
        stride_x = max(1, (img_w - tile_size) // max(1, target_per_dim - 1))
        stride_y = max(1, (img_h - tile_size) // max(1, target_per_dim - 1))
        n_cols = max(1, math.ceil((img_w - tile_size) / stride_x) + 1)
        n_rows = max(1, math.ceil((img_h - tile_size) / stride_y) + 1)
    else:
        stride_x = stride
        stride_y = stride

    for row in range(n_rows):
        for col in range(n_cols):
            x_off = min(col * stride_x, img_w - tile_size)
            y_off = min(row * stride_y, img_h - tile_size)
            x_off = max(0, x_off)
            y_off = max(0, y_off)
            tiles.append(TileSpec(
                x_offset=x_off,
                y_offset=y_off,
                tile_w=min(tile_size, img_w - x_off),
                tile_h=min(tile_size, img_h - y_off),
                scale=1.0,
            ))

    return tiles


def crop_tile(img: np.ndarray, tile: TileSpec) -> np.ndarray:
    """Extract a tile crop from the image, resizing if scale != 1.0."""
    import cv2

    crop = img[
        tile.y_offset : tile.y_offset + tile.tile_h,
        tile.x_offset : tile.x_offset + tile.tile_w,
    ]

    if tile.scale != 1.0:
        new_w = int(crop.shape[1] * tile.scale)
        new_h = int(crop.shape[0] * tile.scale)
        crop = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    return crop


def nms_merge(
    detections: list[dict],
    iou_threshold: float = 0.4,
) -> list[dict]:
    """
    Cross-tile NMS: merge duplicate detections from overlapping tiles.

    Each detection is a dict with keys: bbox, landmarks, det_score, quality.
    bbox = [x, y, w, h] in original image coordinates.
    """
    if not detections:
        return []

    # Sort by detection score descending
    detections = sorted(detections, key=lambda d: d["det_score"], reverse=True)

    keep = []
    suppressed = set()

    for i, det_i in enumerate(detections):
        if i in suppressed:
            continue
        keep.append(det_i)

        for j in range(i + 1, len(detections)):
            if j in suppressed:
                continue
            if _iou(det_i["bbox"], detections[j]["bbox"]) >= iou_threshold:
                suppressed.add(j)

    return keep


def _iou(box_a: list[int], box_b: list[int]) -> float:
    """Compute IoU between two [x, y, w, h] bounding boxes."""
    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)

    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = aw * ah
    area_b = bw * bh
    union = area_a + area_b - inter

    return inter / union if union > 0 else 0.0
