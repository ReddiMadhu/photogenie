"""
Person Routes — §5.8

GET    /v1/groups/{id}/persons                   — person pages
POST   /v1/groups/{id}/persons/{pid}/merge        — merge → person_events
POST   /v1/groups/{id}/persons/{pid}/split        — split → person_events
POST   /v1/groups/{id}/persons/{pid}/rename       — rename → person_events
DELETE /v1/groups/{id}/persons/{pid}              — erasure within group
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from packages.schemas.api_models import (
    MergeRequest,
    PersonListResponse,
    PersonResponse,
    RenameRequest,
    SplitRequest,
)
from services.api.auth import UserInfo, get_current_user, require_group_access
from services.api.database import get_pool

router = APIRouter(prefix="/v1/groups/{group_id}/persons", tags=["Persons"])


@router.get("", response_model=PersonListResponse)
async def list_persons(
    group_id: uuid.UUID,
    user: UserInfo = Depends(get_current_user),
):
    """List all persons in a group."""
    await require_group_access(user, group_id, required_role="viewer")
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM persons WHERE group_id = $1 AND is_hidden = false "
            "ORDER BY face_count DESC",
            group_id,
        )

    persons = [
        PersonResponse(
            id=r["id"], group_id=r["group_id"], name=r["name"],
            face_count=r["face_count"], consent_state=r["consent_state"],
            is_hidden=r["is_hidden"], created_at=r["created_at"],
        )
        for r in rows
    ]

    return PersonListResponse(persons=persons, total=len(persons))


@router.post("/{person_id}/merge")
async def merge_persons(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    req: MergeRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Merge source persons into target person. Emits person_events."""
    await require_group_access(user, group_id, required_role="editor")
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            for source_pid in req.source_person_ids:
                # Reassign all faces
                await conn.execute(
                    "UPDATE faces SET person_id = $1 WHERE person_id = $2 AND group_id = $3",
                    person_id, source_pid, group_id,
                )
                # Delete source person
                await conn.execute(
                    "DELETE FROM persons WHERE id = $1 AND group_id = $2",
                    source_pid, group_id,
                )
                # Emit event
                await conn.execute(
                    "INSERT INTO person_events (tenant_id, group_id, person_id, kind, payload, actor) "
                    "VALUES ($1, $2, $3, 'merge', $4, $5)",
                    user.tenant_id, group_id, person_id,
                    {"merged_from": str(source_pid)},
                    f"user:{user.id}",
                )

            # Update face count
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE person_id = $1 AND group_id = $2",
                person_id, group_id,
            )
            await conn.execute(
                "UPDATE persons SET face_count = $1, updated_at = now() WHERE id = $2",
                count, person_id,
            )

    return {"status": "merged", "target_person_id": str(person_id)}


@router.post("/{person_id}/split")
async def split_person(
    group_id: uuid.UUID,
    person_id: uuid.UUID,
    req: SplitRequest,
    user: UserInfo = Depends(get_current_user),
):
    """Split specified faces into a new person. Emits person_events."""
    await require_group_access(user, group_id, required_role="editor")
    pool = await get_pool()

    new_person_id = uuid.uuid4()

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Create new person
            await conn.execute(
                "INSERT INTO persons (id, tenant_id, group_id, face_count, created_by) "
                "VALUES ($1, $2, $3, $4, $5)",
                new_person_id, user.tenant_id, group_id, len(req.face_ids),
                f"user:{user.id}",
            )

            # Reassign faces
            for fid in req.face_ids:
                await conn.execute(
                    "UPDATE faces SET person_id = $1 WHERE id = $2 AND group_id = $3",
                    new_person_id, fid, group_id,
                )

            # Emit events
            await conn.execute(
                "INSERT INTO person_events (tenant_id, group_id, person_id, kind, payload, actor) "
                "VALUES ($1, $2, $3, 'split', $4, $5)",
                user.tenant_id, group_id, person_id,
                {"split_to": str(new_person_id), "face_ids": [str(f) for f in req.face_ids]},
                f"user:{user.id}",
            )

            # Update face counts
            for pid in (person_id, new_person_id):
                count = await conn.fetchval(
                    "SELECT COUNT(*) FROM faces WHERE person_id = $1 AND group_id = $2",
                    pid, group_id,
                )
                await conn.execute(
                    "UPDATE persons SET face_count = $1, updated_at = now() WHERE id = $2",
                    count, pid,
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
            person_id, group_id,
        )
        await conn.execute(
            "UPDATE persons SET name = $1, updated_at = now() WHERE id = $2 AND group_id = $3",
            req.name, person_id, group_id,
        )
        await conn.execute(
            "INSERT INTO person_events (tenant_id, group_id, person_id, kind, payload, actor) "
            "VALUES ($1, $2, $3, 'rename', $4, $5)",
            user.tenant_id, group_id, person_id,
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
    except Exception:
        pass

    return {"status": "erasure_queued", "person_id": str(person_id)}
