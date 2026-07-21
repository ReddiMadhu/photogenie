"""
Person Routes — §5.8

GET    /v1/groups/{id}/persons                   — person pages (paginated)
GET    /v1/groups/{id}/persons/{pid}/faces       — faces belonging to a person
POST   /v1/groups/{id}/persons/{pid}/merge        — merge → person_events + Qdrant
POST   /v1/groups/{id}/persons/{pid}/split        — split → person_events + Qdrant
POST   /v1/groups/{id}/persons/{pid}/rename       — rename → person_events
DELETE /v1/groups/{id}/persons/{pid}              — erasure within group
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from packages.common.qdrant_identity import async_set_person_payload_by_face_ids
from packages.schemas.api_models import (
    MergeRequest,
    PersonFaceListResponse,
    PersonFaceResponse,
    PersonListResponse,
    PersonResponse,
    RenameRequest,
    SplitRequest,
)
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/groups/{group_id}/persons", tags=["Persons"])


def _rep_face_url(rep_face_id) -> str | None:
    if not rep_face_id:
        return None
    return f"/v1/faces/{rep_face_id}/crop"


def _person_response(r) -> PersonResponse:
    return PersonResponse(
        id=r["id"],
        group_id=r["group_id"],
        name=r["name"],
        face_count=r["face_count"],
        rep_face_url=_rep_face_url(r.get("rep_face_id")),
        consent_state=r["consent_state"],
        is_hidden=r["is_hidden"],
        created_at=r["created_at"],
    )


@router.get("", response_model=PersonListResponse)
async def list_persons(
    group_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: UserInfo = Depends(get_current_user),
):
    """List persons in a group (paginated)."""
    await require_group_access(user, group_id, required_role="viewer")
    pool = await get_pool()

    async with pool.acquire() as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM persons WHERE group_id = $1 AND is_hidden = false",
            group_id,
        )
        rows = await conn.fetch(
            "SELECT id, group_id, name, face_count, rep_face_id, consent_state, "
            "is_hidden, created_at FROM persons "
            "WHERE group_id = $1 AND is_hidden = false "
            "ORDER BY face_count DESC "
            "LIMIT $2 OFFSET $3",
            group_id,
            limit,
            offset,
        )

        # Backfill rep_face_id from highest-quality face when missing
        persons = []
        for r in rows:
            rep_id = r["rep_face_id"]
            if not rep_id:
                rep_id = await conn.fetchval(
                    "SELECT id FROM faces WHERE person_id = $1 AND group_id = $2 "
                    "ORDER BY quality DESC NULLS LAST LIMIT 1",
                    r["id"],
                    group_id,
                )
                if rep_id:
                    await conn.execute(
                        "UPDATE persons SET rep_face_id = $1 WHERE id = $2",
                        rep_id,
                        r["id"],
                    )
            data = dict(r)
            data["rep_face_id"] = rep_id
            persons.append(_person_response(data))

    return PersonListResponse(persons=persons, total=total or 0)


@router.get("/{person_id}/faces", response_model=PersonFaceListResponse)
async def list_person_faces(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: UserInfo = Depends(get_current_user),
):
    """List faces belonging to a person (for split UI)."""
    await require_group_access(user, group_id, required_role="viewer")
    pool = await get_pool()

    async with pool.acquire() as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM faces WHERE person_id = $1 AND group_id = $2",
            person_id,
            group_id,
        )
        rows = await conn.fetch(
            "SELECT id, asset_id, crop_path, quality, "
            "bbox_x, bbox_y, bbox_w, bbox_h "
            "FROM faces WHERE person_id = $1 AND group_id = $2 "
            "ORDER BY quality DESC NULLS LAST "
            "LIMIT $3 OFFSET $4",
            person_id,
            group_id,
            limit,
            offset,
        )

    faces = [
        PersonFaceResponse(
            id=r["id"],
            asset_id=r["asset_id"],
            crop_url=f"/v1/faces/{r['id']}/crop" if r["crop_path"] else None,
            quality=r["quality"],
            bbox=[r["bbox_x"], r["bbox_y"], r["bbox_w"], r["bbox_h"]],
        )
        for r in rows
    ]
    return PersonFaceListResponse(faces=faces, total=total or 0)


@router.post("/{person_id}/merge")
async def merge_persons(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    req: MergeRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Merge source persons into target person. Emits person_events + syncs Qdrant."""
    await require_group_access(user, group_id, required_role="editor")
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            for source_pid in req.source_person_ids:
                face_rows = await conn.fetch(
                    "SELECT id FROM faces WHERE person_id = $1 AND group_id = $2",
                    source_pid,
                    group_id,
                )
                face_ids = [str(r["id"]) for r in face_rows]

                await conn.execute(
                    "UPDATE faces SET person_id = $1 WHERE person_id = $2 AND group_id = $3",
                    person_id,
                    source_pid,
                    group_id,
                )
                await conn.execute(
                    "DELETE FROM persons WHERE id = $1 AND group_id = $2",
                    source_pid,
                    group_id,
                )
                await conn.execute(
                    "INSERT INTO person_events "
                    "(tenant_id, group_id, person_id, kind, payload, actor) "
                    "VALUES ($1, $2, $3, 'merge', $4, $5)",
                    user.tenant_id,
                    group_id,
                    person_id,
                    {
                        "merged_from": str(source_pid),
                        "merged_faces": face_ids,
                    },
                    f"user:{user.id}",
                )

                try:
                    await async_set_person_payload_by_face_ids(
                        conn, face_ids, str(person_id)
                    )
                except Exception as e:
                    logger.error(f"Qdrant merge sync failed: {e}")
                    raise HTTPException(
                        status_code=502,
                        detail=f"Identity index sync failed: {e}",
                    )

            count = await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE person_id = $1 AND group_id = $2",
                person_id,
                group_id,
            )
            best_face = await conn.fetchval(
                "SELECT id FROM faces WHERE person_id = $1 AND group_id = $2 "
                "ORDER BY quality DESC NULLS LAST LIMIT 1",
                person_id,
                group_id,
            )
            await conn.execute(
                "UPDATE persons SET face_count = $1, rep_face_id = $2, "
                "updated_at = now() WHERE id = $3",
                count,
                best_face,
                person_id,
            )

            await conn.execute(
                "INSERT INTO audit_log (tenant_id, user_id, action, resource, details) "
                "VALUES ($1, $2, 'merge', $3, $4)",
                user.tenant_id,
                user.id,
                f"person:{person_id}",
                {
                    "group_id": str(group_id),
                    "source_person_ids": [str(s) for s in req.source_person_ids],
                },
            )

    return {"status": "merged", "target_person_id": str(person_id)}


@router.post("/{person_id}/split")
async def split_person(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    req: SplitRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Split specified faces into a new person. Emits person_events + syncs Qdrant."""
    await require_group_access(user, group_id, required_role="editor")
    if not req.face_ids:
        raise HTTPException(status_code=400, detail="face_ids must not be empty")

    pool = await get_pool()
    new_person_id = uuid.uuid4()
    face_ids = [str(f) for f in req.face_ids]

    async with pool.acquire() as conn:
        async with conn.transaction():
            owned = await conn.fetchval(
                "SELECT COUNT(*) FROM faces "
                "WHERE id = ANY($1::uuid[]) AND person_id = $2 AND group_id = $3",
                face_ids,
                person_id,
                group_id,
            )
            if owned != len(face_ids):
                raise HTTPException(
                    status_code=400,
                    detail="One or more faces do not belong to this person",
                )

            remaining = await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE person_id = $1 AND group_id = $2",
                person_id,
                group_id,
            )
            if remaining - len(face_ids) < 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot split all faces; leave at least one on the original person",
                )

            await conn.execute(
                "INSERT INTO persons (id, tenant_id, group_id, face_count, "
                "rep_face_id, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
                new_person_id,
                user.tenant_id,
                group_id,
                len(req.face_ids),
                req.face_ids[0],
                f"user:{user.id}",
            )

            for fid in req.face_ids:
                await conn.execute(
                    "UPDATE faces SET person_id = $1 WHERE id = $2 AND group_id = $3",
                    new_person_id,
                    fid,
                    group_id,
                )

            await conn.execute(
                "INSERT INTO person_events "
                "(tenant_id, group_id, person_id, kind, payload, actor) "
                "VALUES ($1, $2, $3, 'split', $4, $5)",
                user.tenant_id,
                group_id,
                person_id,
                {"split_to": str(new_person_id), "face_ids": face_ids},
                f"user:{user.id}",
            )

            for pid in (person_id, new_person_id):
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM faces WHERE person_id = $1 AND group_id = $2",
                    pid,
                    group_id,
                )
                best_face = await conn.fetchval(
                    "SELECT id FROM faces WHERE person_id = $1 AND group_id = $2 "
                    "ORDER BY quality DESC NULLS LAST LIMIT 1",
                    pid,
                    group_id,
                )
                await conn.execute(
                    "UPDATE persons SET face_count = $1, rep_face_id = $2, "
                    "updated_at = now() WHERE id = $3",
                    count,
                    best_face,
                    pid,
                )

            try:
                await async_set_person_payload_by_face_ids(
                    conn, face_ids, str(new_person_id)
                )
            except Exception as e:
                logger.error(f"Qdrant split sync failed: {e}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Identity index sync failed: {e}",
                )

            await conn.execute(
                "INSERT INTO audit_log (tenant_id, user_id, action, resource, details) "
                "VALUES ($1, $2, 'split', $3, $4)",
                user.tenant_id,
                user.id,
                f"person:{person_id}",
                {
                    "group_id": str(group_id),
                    "new_person_id": str(new_person_id),
                    "face_ids": face_ids,
                },
            )

    return {"status": "split", "new_person_id": str(new_person_id)}


@router.post("/{person_id}/rename")
async def rename_person(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    req: RenameRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Rename a person. Emits person_events."""
    await require_group_access(user, group_id, required_role="editor")
    pool = await get_pool()

    async with pool.acquire() as conn:
        old = await conn.fetchval(
            "SELECT name FROM persons WHERE id = $1 AND group_id = $2",
            person_id,
            group_id,
        )
        await conn.execute(
            "UPDATE persons SET name = $1, updated_at = now() "
            "WHERE id = $2 AND group_id = $3",
            req.name,
            person_id,
            group_id,
        )
        await conn.execute(
            "INSERT INTO person_events "
            "(tenant_id, group_id, person_id, kind, payload, actor) "
            "VALUES ($1, $2, $3, 'rename', $4, $5)",
            user.tenant_id,
            group_id,
            person_id,
            {"old_name": old, "new_name": req.name},
            f"user:{user.id}",
        )

    return {"status": "renamed", "name": req.name}


@router.delete("/{person_id}")
async def delete_person(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """Erase a person from a group (§5.13). Triggers async erasure task."""
    await require_group_access(user, group_id, required_role="editor")

    try:
        from services.workers.tasks.erase import erase_person

        erase_person.delay(
            str(user.tenant_id), str(group_id), str(person_id), str(user.id)
        )
    except Exception as e:
        logger.error(f"Failed to enqueue erasure: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not queue erasure task: {e}",
        )

    return {"status": "erasure_queued", "person_id": str(person_id)}
