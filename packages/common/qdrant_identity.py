"""
Shared Qdrant identity helpers — keep Postgres person_id and Qdrant payloads in sync.
"""

from __future__ import annotations

import logging
import os
from typing import Iterable, Optional

logger = logging.getLogger(__name__)


def get_qdrant_client():
    """Create a Qdrant client from environment defaults."""
    from qdrant_client import QdrantClient

    return QdrantClient(
        host=os.getenv("QDRANT_HOST", "qdrant"),
        port=int(os.getenv("QDRANT_PORT", "6333")),
    )


def set_person_payload(
    embedding_ids: Iterable[str],
    person_id: Optional[str],
    qdrant_client=None,
    collection: str = "faces_v1",
) -> int:
    """
    Set person_id payload on Qdrant points identified by embedding_id.

    Returns the number of points updated. Raises on hard Qdrant failures
    when any IDs were provided.
    """
    ids = [eid for eid in embedding_ids if eid]
    if not ids:
        return 0

    client = qdrant_client or get_qdrant_client()
    try:
        from qdrant_client.models import PointIdsList

        client.set_payload(
            collection_name=collection,
            payload={"person_id": person_id},
            points=PointIdsList(points=ids),
        )
        return len(ids)
    except Exception as e:
        logger.error(f"Failed to update Qdrant person_id for {len(ids)} points: {e}")
        raise


def set_person_payload_by_face_ids(
    face_ids: Iterable[str],
    person_id: Optional[str],
    db_conn=None,
    fetch_embedding_ids=None,
    qdrant_client=None,
) -> int:
    """
    Look up embedding_ids for face_ids then update Qdrant.

    fetch_embedding_ids: callable(face_ids) -> list[str]
    OR pass db_conn with a sync cursor interface (psycopg2 connection).
    """
    face_id_list = [str(f) for f in face_ids if f]
    if not face_id_list:
        return 0

    if fetch_embedding_ids is not None:
        embedding_ids = fetch_embedding_ids(face_id_list)
    elif db_conn is not None:
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT embedding_id FROM faces WHERE id = ANY(%s::uuid[]) AND embedding_id IS NOT NULL",
                (face_id_list,),
            )
            embedding_ids = [str(r[0]) for r in cur.fetchall()]
    else:
        raise ValueError("Need fetch_embedding_ids or db_conn")

    return set_person_payload(embedding_ids, person_id, qdrant_client=qdrant_client)


async def async_set_person_payload_by_face_ids(
    conn,
    face_ids: Iterable[str],
    person_id: Optional[str],
    qdrant_client=None,
) -> int:
    """Asyncpg variant: resolve embedding_ids then update Qdrant."""
    face_id_list = [str(f) for f in face_ids if f]
    if not face_id_list:
        return 0

    rows = await conn.fetch(
        "SELECT embedding_id FROM faces "
        "WHERE id = ANY($1::uuid[]) AND embedding_id IS NOT NULL",
        face_id_list,
    )
    embedding_ids = [str(r["embedding_id"]) for r in rows]
    return set_person_payload(embedding_ids, person_id, qdrant_client=qdrant_client)
