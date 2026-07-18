-- =============================================================================
-- Enterprise Face Search Platform — Initial Schema (§5.4)
-- Group-first, transactional 15K quota, embedding versioning, tsvector
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            text NOT NULL,
    kms_key_id      text,                -- for crypto-shredding (Phase 3)
    retention_days  int,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       text NOT NULL,
    oidc_sub    text UNIQUE,             -- OIDC subject claim
    name        text,
    is_admin    boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_tenant_idx ON users (tenant_id);
CREATE INDEX users_email_idx ON users (email);

-- ---------------------------------------------------------------------------
-- Search Groups — first-class searchable folder/section (§5.1)
-- ---------------------------------------------------------------------------
CREATE TABLE search_groups (
    id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                 text NOT NULL,
    owner_user_id        uuid REFERENCES users(id),
    max_active_images    int NOT NULL DEFAULT 15000,    -- hard product cap
    active_image_count   int NOT NULL DEFAULT 0,        -- maintained transactionally
    status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CHECK (active_image_count >= 0),
    CHECK (active_image_count <= max_active_images)
);
CREATE INDEX search_groups_tenant_idx ON search_groups (tenant_id);

-- ---------------------------------------------------------------------------
-- Search Group Membership — RBAC (owner|editor|viewer)
-- ---------------------------------------------------------------------------
CREATE TABLE search_group_members (
    group_id    uuid NOT NULL REFERENCES search_groups(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Sources — connectors bound to groups
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id    uuid NOT NULL REFERENCES search_groups(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('gdrive', 'upload', 'sharepoint', 's3')),
    config      jsonb NOT NULL DEFAULT '{}',
    cursor      text,                    -- delta sync cursor (page token, etc.)
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sources_group_idx ON sources (group_id);

-- ---------------------------------------------------------------------------
-- Assets — images within a search group
-- ---------------------------------------------------------------------------
CREATE TABLE assets (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id          uuid NOT NULL REFERENCES search_groups(id) ON DELETE CASCADE,
    source_id         uuid REFERENCES sources(id),
    source_object_id  text,              -- external ID (Drive file ID, S3 key, etc.)
    etag              text,              -- external version tag
    sha256            bytea,             -- exact dedup key
    phash             bigint,            -- perceptual hash
    sscd_id           uuid,              -- near-dup cluster (SSCD, future)
    filename          text,
    mime_type         text,
    file_size_bytes   bigint,
    width             int,
    height            int,
    taken_at          timestamptz,       -- EXIF date
    imported_at       timestamptz NOT NULL DEFAULT now(),
    exif_data         jsonb,             -- raw EXIF metadata
    acl               jsonb,             -- mirrored source ACL
    status            text NOT NULL DEFAULT 'reserved'
                      CHECK (status IN ('reserved', 'ready', 'failed', 'deleted')),
    deleted_at        timestamptz,
    -- Full-text search columns (§5.2: tsvector for OCR/filename/caption)
    text_search       tsvector,
    caption           text,
    ocr_text          text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, source_id, source_object_id, etag)
);
CREATE INDEX assets_group_active_idx ON assets (group_id)
    WHERE deleted_at IS NULL AND status IN ('reserved', 'ready');
CREATE INDEX assets_sha256_idx ON assets (group_id, sha256)
    WHERE sha256 IS NOT NULL;
CREATE INDEX assets_phash_idx ON assets (group_id, phash)
    WHERE phash IS NOT NULL;
CREATE INDEX assets_text_search_idx ON assets USING GIN (text_search);

-- Trigger to auto-update tsvector from filename/caption/ocr
CREATE OR REPLACE FUNCTION assets_text_search_update() RETURNS trigger AS $$
BEGIN
    NEW.text_search := to_tsvector('english',
        coalesce(NEW.filename, '') || ' ' ||
        coalesce(NEW.caption, '') || ' ' ||
        coalesce(NEW.ocr_text, '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assets_text_search_trigger
    BEFORE INSERT OR UPDATE OF filename, caption, ocr_text ON assets
    FOR EACH ROW EXECUTE FUNCTION assets_text_search_update();

-- ---------------------------------------------------------------------------
-- Faces — detected faces with quality and embedding metadata
-- ---------------------------------------------------------------------------
CREATE TABLE faces (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id        uuid NOT NULL REFERENCES search_groups(id) ON DELETE CASCADE,
    asset_id        uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    bbox_x          int NOT NULL,
    bbox_y          int NOT NULL,
    bbox_w          int NOT NULL,
    bbox_h          int NOT NULL,
    landmarks       jsonb,               -- 5-point landmarks [{x, y}, ...]
    align_matrix    float4[],            -- 2x3 affine transform (6 values)
    det_score       float4 NOT NULL,     -- detector confidence
    quality         float4,              -- CR-FIQA quality score
    person_id       uuid,                -- NULL = unknown/unassigned
    model_id        text NOT NULL,       -- e.g., 'arcface_r50'
    model_version   text NOT NULL,       -- e.g., 'w600k_r50_v1'
    embedding_id    uuid,                -- maps to Qdrant point ID
    crop_path       text,                -- object store path to aligned crop
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX faces_asset_idx ON faces (asset_id);
CREATE INDEX faces_group_idx ON faces (group_id);
CREATE INDEX faces_person_idx ON faces (group_id, person_id)
    WHERE person_id IS NOT NULL;
CREATE INDEX faces_quality_idx ON faces (group_id, quality DESC);

-- ---------------------------------------------------------------------------
-- Persons — identity entities, always per-group (§5.6)
-- ---------------------------------------------------------------------------
CREATE TABLE persons (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    group_id        uuid NOT NULL REFERENCES search_groups(id) ON DELETE CASCADE,
    name            text,                -- user-assigned name (NULL = unnamed)
    centroid_model  text,                -- which model computed the centroid
    rep_face_id     uuid,                -- representative face (best quality)
    consent_state   text NOT NULL DEFAULT 'unknown'
                    CHECK (consent_state IN ('unknown', 'consented', 'withdrawn')),
    face_count      int NOT NULL DEFAULT 0,
    is_hidden       boolean NOT NULL DEFAULT false,
    created_by      text,                -- 'system' | 'user:<id>' | 'clustering'
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX persons_group_idx ON persons (group_id);
CREATE INDEX persons_name_idx ON persons (group_id, name)
    WHERE name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Person Events — immutable audit trail (§5.6: "everything is an event")
-- ---------------------------------------------------------------------------
CREATE TABLE person_events (
    id          bigserial PRIMARY KEY,
    tenant_id   uuid NOT NULL,
    group_id    uuid NOT NULL,
    person_id   uuid,
    kind        text NOT NULL CHECK (kind IN (
                    'assign', 'unassign', 'merge', 'split',
                    'rename', 'confirm', 'reject', 'erase',
                    'cluster_create', 'cluster_update'
                )),
    payload     jsonb NOT NULL DEFAULT '{}',
    actor       text NOT NULL,           -- 'system' | 'user:<id>' | 'clustering:<job>'
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX person_events_group_idx ON person_events (group_id, created_at DESC);
CREATE INDEX person_events_person_idx ON person_events (person_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Feedback Pairs — for threshold calibration (§5.6)
-- ---------------------------------------------------------------------------
CREATE TABLE feedback_pairs (
    id          bigserial PRIMARY KEY,
    tenant_id   uuid NOT NULL,
    group_id    uuid NOT NULL,
    query_face  uuid NOT NULL,
    cand_face   uuid NOT NULL,
    label       boolean NOT NULL,        -- true = same person, false = different
    source      text NOT NULL DEFAULT 'user',  -- 'user' | 'merge_event' | 'split_event'
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_pairs_group_idx ON feedback_pairs (group_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Audit Log — immutable, append-only (§5.8)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id          bigserial PRIMARY KEY,
    tenant_id   uuid NOT NULL,
    user_id     uuid,
    action      text NOT NULL,           -- 'search', 'upload', 'delete', 'merge', etc.
    resource    text NOT NULL,           -- 'group:<id>', 'asset:<id>', 'person:<id>'
    details     jsonb NOT NULL DEFAULT '{}',
    ip_address  inet,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_idx ON audit_log (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Calibration Thresholds — per-group tuned thresholds (§5.6)
-- ---------------------------------------------------------------------------
CREATE TABLE calibration_thresholds (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid NOT NULL,
    group_id        uuid NOT NULL REFERENCES search_groups(id) ON DELETE CASCADE,
    tau_assign      float4 NOT NULL DEFAULT 0.5,   -- online assignment threshold
    tau_search      float4 NOT NULL DEFAULT 0.4,   -- search retrieval threshold
    pair_count      int NOT NULL DEFAULT 0,         -- training pairs used
    calibrated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, group_id)
);
