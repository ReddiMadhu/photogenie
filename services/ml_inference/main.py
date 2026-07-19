"""
ML Inference Service — §5.5

FastAPI service exposing /detect, /embed, /quality endpoints.
Loads InsightFace models on startup via ONNXRuntime.
"""

from __future__ import annotations

import io
import logging
import os
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

from services.ml_inference.detector import FaceDetector
from services.ml_inference.embedder import FaceEmbedder
from services.ml_inference.quality import score_face_quality

logger = logging.getLogger(__name__)

# Global model instances
detector: FaceDetector | None = None
embedder: FaceEmbedder | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup."""
    global detector, embedder

    model_pack = os.getenv("ML_MODEL_PACK", "buffalo_l")
    det_size = int(os.getenv("ML_DET_SIZE", "640"))
    det_floor = float(os.getenv("ML_DET_SCORE_FLOOR", "0.5"))
    min_face = int(os.getenv("ML_MIN_FACE_PX", "20"))

    providers = ["CPUExecutionProvider"]
    try:
        import onnxruntime
        available = onnxruntime.get_available_providers()
        if "CUDAExecutionProvider" in available:
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            logger.info("GPU detected — using CUDA execution provider")
    except ImportError:
        pass

    detector = FaceDetector(
        model_pack=model_pack,
        det_size=det_size,
        det_score_floor=det_floor,
        min_face_px=min_face,
        providers=providers,
    )
    detector.load()

    embedder = FaceEmbedder(
        model_pack=model_pack,
        providers=providers,
    )
    embedder.load()

    logger.info("ML Inference service ready")
    yield
    logger.info("ML Inference service shutting down")


app = FastAPI(
    title="PhotoGenic ML Inference",
    description="Face detection, alignment, embedding, and quality scoring",
    version="0.1.0",
    lifespan=lifespan,
)


def _load_image(file_bytes: bytes) -> np.ndarray:
    """Load image bytes to BGR numpy array."""
    import cv2
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image")
    return img


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "detector_loaded": detector is not None and detector._model is not None,
        "embedder_loaded": embedder is not None and embedder._model is not None,
    }


@app.post("/detect")
async def detect_faces(file: UploadFile = File(...), use_sahi: bool = True):
    """
    Detect faces in an image using SAHI-tiled detection.

    Returns bounding boxes, landmarks, detection scores, and quality scores.
    """
    contents = await file.read()
    img = _load_image(contents)

    faces = detector.detect(img, use_sahi=use_sahi)

    results = []
    for face in faces:
        # Score quality
        quality = score_face_quality(
            face_crop=face.crop,
            det_score=face.det_score,
            face_bbox=face.bbox,
            image_shape=img.shape[:2],
        )

        results.append({
            "bbox": face.bbox,
            "landmarks": face.landmarks.tolist(),
            "det_score": face.det_score,
            "quality": quality.overall,
            "quality_detail": {
                "sharpness": quality.sharpness,
                "brightness": quality.brightness,
                "contrast": quality.contrast,
                "face_size": quality.face_size,
            },
        })

    return {"faces": results, "count": len(results)}


@app.post("/embed")
async def embed_face(file: UploadFile = File(...)):
    """
    Detect, align, and embed all faces in an image.

    Returns face detections with 512-D ArcFace embeddings.
    """
    contents = await file.read()
    img = _load_image(contents)

    faces = detector.detect(img, use_sahi=True)

    results = []
    for face in faces:
        emb_result = embedder.embed(face.crop)

        quality = score_face_quality(
            face_crop=face.crop,
            det_score=face.det_score,
            face_bbox=face.bbox,
            image_shape=img.shape[:2],
            embedding_raw=emb_result.embedding_raw,
        )

        results.append({
            "bbox": face.bbox,
            "landmarks": face.landmarks.tolist(),
            "det_score": face.det_score,
            "quality": quality.overall,
            "embedding": emb_result.embedding.tolist(),
            "model_id": emb_result.model_id,
            "model_version": emb_result.model_version,
            "align_matrix": face.align_matrix.tolist(),
        })

    return {"faces": results, "count": len(results)}


@app.post("/quality")
async def assess_quality_endpoint(file: UploadFile = File(...)):
    """
    Assess quality of all faces in an image.
    """
    contents = await file.read()
    img = _load_image(contents)

    faces = detector.detect(img, use_sahi=False)

    results = []
    for face in faces:
        quality = score_face_quality(
            face_crop=face.crop,
            det_score=face.det_score,
            face_bbox=face.bbox,
            image_shape=img.shape[:2],
        )
        results.append({
            "bbox": face.bbox,
            "det_score": face.det_score,
            "quality": quality.overall,
            "sharpness": quality.sharpness,
            "brightness": quality.brightness,
            "contrast": quality.contrast,
            "face_size": quality.face_size,
        })

    return {"faces": results, "count": len(results)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("ML_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
