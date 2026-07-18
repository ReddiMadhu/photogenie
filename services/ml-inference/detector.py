"""
Face Detector — §5.5 SAHI-Tiled SCRFD/RetinaFace

The detection wrapper that none of the 4 reference projects implement:
multi-scale overlap tiling + cross-tile NMS for recovering small faces
in high-resolution group photos.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from packages.vision.alignment import norm_crop
from packages.vision.sahi_tiler import SAHIConfig, compute_tiles, crop_tile, nms_merge

logger = logging.getLogger(__name__)


@dataclass
class DetectedFace:
    """A detected face with all metadata."""
    bbox: list[int]           # [x, y, w, h] in original image coords
    landmarks: np.ndarray     # (5, 2) facial landmarks
    det_score: float          # detector confidence
    crop: np.ndarray          # aligned 112x112 face crop (BGR)
    align_matrix: np.ndarray  # (2, 3) alignment transform
    tile_index: int = 0       # which tile detected this face


class FaceDetector:
    """
    SAHI-tiled face detection using InsightFace models.

    Wraps InsightFace's FaceAnalysis with SAHI tiling for small-face
    recovery. Supports both RetinaFace (buffalo_l) and SCRFD (antelopev2).
    """

    def __init__(
        self,
        model_pack: str = "buffalo_l",
        det_size: int = 640,
        det_score_floor: float = 0.5,
        min_face_px: int = 20,
        providers: Optional[list[str]] = None,
    ):
        self.model_pack = model_pack
        self.det_size = det_size
        self.det_score_floor = det_score_floor
        self.min_face_px = min_face_px
        self._model = None
        self._providers = providers or ["CPUExecutionProvider"]

    def load(self) -> None:
        """Load the InsightFace model pack."""
        try:
            from insightface.app import FaceAnalysis

            self._model = FaceAnalysis(
                name=self.model_pack,
                providers=self._providers,
            )
            self._model.prepare(ctx_id=0, det_size=(self.det_size, self.det_size))
            logger.info(
                f"Loaded face detector: {self.model_pack}, "
                f"det_size={self.det_size}, providers={self._providers}"
            )
        except ImportError:
            logger.warning(
                "InsightFace not installed. Using stub detector. "
                "Install with: pip install insightface onnxruntime"
            )
            self._model = None

    def detect(
        self,
        img: np.ndarray,
        use_sahi: bool = True,
        sahi_config: Optional[SAHIConfig] = None,
    ) -> list[DetectedFace]:
        """
        Detect faces with optional SAHI tiling (§5.5).

        Args:
            img: BGR image (H, W, 3)
            use_sahi: whether to use tiled detection
            sahi_config: SAHI configuration overrides

        Returns:
            list of DetectedFace instances in original image coordinates
        """
        if self._model is None:
            logger.warning("Detector not loaded, returning empty results")
            return []

        h, w = img.shape[:2]

        if not use_sahi or (h <= self.det_size and w <= self.det_size):
            # Single-pass detection (small images)
            return self._detect_single(img, tile_index=0)

        # SAHI tiled detection
        config = sahi_config or SAHIConfig(
            det_size=self.det_size,
            min_face_px=self.min_face_px,
        )
        tiles = compute_tiles(h, w, config)
        logger.debug(f"SAHI: {len(tiles)} tiles for {w}x{h} image")

        all_detections = []
        for idx, tile in enumerate(tiles):
            tile_crop = crop_tile(img, tile)
            raw_faces = self._detect_raw(tile_crop)

            for face in raw_faces:
                # Map coordinates back to original image
                bbox = tile.offset_bbox(face["bbox"])
                landmarks = tile.offset_landmarks(face["landmarks"])

                if face["det_score"] < self.det_score_floor:
                    continue
                if min(bbox[2], bbox[3]) < self.min_face_px:
                    continue

                all_detections.append({
                    "bbox": bbox,
                    "landmarks": landmarks,
                    "det_score": face["det_score"],
                    "tile_index": idx,
                })

        # Cross-tile NMS merge
        merged = nms_merge(all_detections, iou_threshold=0.4)

        # Align each face using the original image
        results = []
        for det in merged:
            aligned, M = norm_crop(img, det["landmarks"])
            results.append(DetectedFace(
                bbox=det["bbox"],
                landmarks=det["landmarks"],
                det_score=det["det_score"],
                crop=aligned,
                align_matrix=M,
                tile_index=det.get("tile_index", 0),
            ))

        logger.info(f"Detected {len(results)} faces ({len(tiles)} tiles, "
                     f"{len(all_detections)} raw, {len(merged)} after NMS)")
        return results

    def _detect_single(self, img: np.ndarray, tile_index: int = 0) -> list[DetectedFace]:
        """Single-pass detection without tiling."""
        raw_faces = self._detect_raw(img)
        results = []

        for face in raw_faces:
            if face["det_score"] < self.det_score_floor:
                continue
            if min(face["bbox"][2], face["bbox"][3]) < self.min_face_px:
                continue

            aligned, M = norm_crop(img, face["landmarks"])
            results.append(DetectedFace(
                bbox=face["bbox"],
                landmarks=face["landmarks"],
                det_score=face["det_score"],
                crop=aligned,
                align_matrix=M,
                tile_index=tile_index,
            ))

        return results

    def _detect_raw(self, img: np.ndarray) -> list[dict]:
        """Run InsightFace detection, return raw results."""
        faces = self._model.get(img)
        results = []

        for face in faces:
            bbox = face.bbox.astype(int).tolist()
            # Convert from [x1, y1, x2, y2] to [x, y, w, h]
            x1, y1, x2, y2 = bbox
            bbox_xywh = [x1, y1, x2 - x1, y2 - y1]

            results.append({
                "bbox": bbox_xywh,
                "landmarks": face.kps if face.kps is not None else np.zeros((5, 2)),
                "det_score": float(face.det_score),
            })

        return results
