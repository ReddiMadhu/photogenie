"""
Qdrant Collection Initialization — §5.4

Creates the `faces_v1` collection with:
- 512-D cosine distance, fp32 (no quantization at this scale)
- Payload indexes on tenant_id and group_id (mandatory filters)
- Payload schema: tenant_id, group_id, face_id, person_id,
                  asset_id, quality, taken_at, model_version
"""

import os
import sys
import time

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    PayloadSchemaType,
    VectorParams,
)


def init_collections() -> None:
    """Create Qdrant collections if they don't exist."""
    host = os.getenv("QDRANT_HOST", "localhost")
    port = int(os.getenv("QDRANT_PORT", "6333"))

    # Retry connection (Qdrant may still be starting)
    client = None
    for attempt in range(30):
        try:
            client = QdrantClient(host=host, port=port, timeout=10)
            client.get_collections()
            break
        except Exception:
            print(f"Waiting for Qdrant at {host}:{port}... (attempt {attempt + 1})")
            time.sleep(2)
    else:
        print("ERROR: Could not connect to Qdrant after 60s")
        sys.exit(1)

    # -------------------------------------------------------------------------
    # faces_v1 — primary face embedding collection
    # -------------------------------------------------------------------------
    FACES_COLLECTION = "faces_v1"
    existing = [c.name for c in client.get_collections().collections]

    if FACES_COLLECTION not in existing:
        print(f"Creating collection: {FACES_COLLECTION}")
        client.create_collection(
            collection_name=FACES_COLLECTION,
            vectors_config=VectorParams(
                size=512,              # ArcFace R50 w600k_r50
                distance=Distance.COSINE,
            ),
        )

        # Payload indexes for mandatory filters (§5.4: "Every search/upsert/
        # delete passes both filters")
        client.create_payload_index(
            collection_name=FACES_COLLECTION,
            field_name="tenant_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=FACES_COLLECTION,
            field_name="group_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=FACES_COLLECTION,
            field_name="person_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=FACES_COLLECTION,
            field_name="model_version",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=FACES_COLLECTION,
            field_name="quality",
            field_schema=PayloadSchemaType.FLOAT,
        )

        print(f"✅  Collection {FACES_COLLECTION} created with payload indexes.")
    else:
        print(f"Collection {FACES_COLLECTION} already exists, skipping.")

    # -------------------------------------------------------------------------
    # clip_v1 — Phase 3 placeholder for SigLIP embeddings
    # -------------------------------------------------------------------------
    CLIP_COLLECTION = "clip_v1"
    if CLIP_COLLECTION not in existing:
        print(f"Creating collection: {CLIP_COLLECTION}")
        client.create_collection(
            collection_name=CLIP_COLLECTION,
            vectors_config=VectorParams(
                size=512,              # SigLIP / OpenCLIP (Phase 3)
                distance=Distance.COSINE,
            ),
        )
        client.create_payload_index(
            collection_name=CLIP_COLLECTION,
            field_name="tenant_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=CLIP_COLLECTION,
            field_name="group_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        print(f"✅  Collection {CLIP_COLLECTION} created (Phase 3 placeholder).")
    else:
        print(f"Collection {CLIP_COLLECTION} already exists, skipping.")

    print("✅  Qdrant initialization complete.")


if __name__ == "__main__":
    init_collections()
