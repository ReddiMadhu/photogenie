"""
ArcFace Embedder — §3.5 / §5.5

ArcFace R50 (w600k_r50) embedding via ONNXRuntime.
512-D L2-normalized output with embedding versioning metadata.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Face embedding with versioning metadata."""
    embedding: np.ndarray      # (512,) L2-normalized
    embedding_raw: np.ndarray  # (512,) before L2-normalization (for quality)
    model_id: str              # e.g., 'arcface_r50'
    model_version: str         # e.g., 'w600k_r50_v1'
    norm: float                # L2 norm before normalization


class FaceEmbedder:
    """
    ArcFace face embedding via InsightFace / ONNXRuntime.

    §5.5: ArcFace 512-D with embedding versioning (model_id, version)
    on every vector.
    """

    def __init__(
        self,
        model_pack: str = "buffalo_l",
        model_id: str = "arcface_r50",
        model_version: str = "w600k_r50_v1",
        providers: Optional[list[str]] = None,
    ):
        self.model_pack = model_pack
        self.model_id = model_id
        self.model_version = model_version
        self._model = None
        self._providers = providers or ["CPUExecutionProvider"]

    def load(self) -> None:
        """Load the recognition model from the InsightFace model pack."""
        try:
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(
                name=self.model_pack,
                providers=self._providers,
            )
            app.prepare(ctx_id=0)

            # Extract the recognition model
            for model in app.models.values():
                if hasattr(model, "get_feat") or "recognition" in str(type(model)).lower():
                    self._model = model
                    break

            if self._model is None:
                # Fallback: try to find any model with embedding capability
                for model in app.models.values():
                    if hasattr(model, "get"):
                        self._model = model
                        break

            if self._model is not None:
                logger.info(f"Loaded embedder: {self.model_id} ({self.model_version})")
            else:
                logger.warning("Could not find recognition model in pack")

        except ImportError:
            logger.warning(
                "InsightFace not installed. Using stub embedder. "
                "Install with: pip install insightface onnxruntime"
            )

    def embed(self, aligned_face: np.ndarray) -> EmbeddingResult:
        """
        Generate a 512-D ArcFace embedding from an aligned face crop.

        Args:
            aligned_face: (112, 112, 3) BGR aligned face crop

        Returns:
            EmbeddingResult with normalized embedding and metadata
        """
        if self._model is None:
            # Stub: return random embedding for development
            logger.warning("Using stub embedding (model not loaded)")
            raw = np.random.randn(512).astype(np.float32)
            norm = float(np.linalg.norm(raw))
            normalized = raw / max(norm, 1e-6)
            return EmbeddingResult(
                embedding=normalized,
                embedding_raw=raw,
                model_id=self.model_id,
                model_version=self.model_version,
                norm=norm,
            )

        # Run inference
        try:
            # InsightFace recognition model expects (112, 112, 3) BGR
            if hasattr(self._model, "get_feat"):
                raw = self._model.get_feat(aligned_face)
            else:
                # Some model wrappers use different API
                raw = self._model.get(aligned_face)

            if isinstance(raw, list):
                raw = raw[0]
            raw = raw.flatten().astype(np.float32)

        except Exception as e:
            logger.error(f"Embedding inference failed: {e}")
            raw = np.zeros(512, dtype=np.float32)

        norm = float(np.linalg.norm(raw))
        normalized = raw / max(norm, 1e-6)

        return EmbeddingResult(
            embedding=normalized,
            embedding_raw=raw,
            model_id=self.model_id,
            model_version=self.model_version,
            norm=norm,
        )

    def embed_batch(self, aligned_faces: list[np.ndarray]) -> list[EmbeddingResult]:
        """Embed a batch of aligned face crops."""
        return [self.embed(face) for face in aligned_faces]
