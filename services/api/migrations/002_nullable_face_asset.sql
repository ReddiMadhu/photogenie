-- Allow query faces (search-time) without a backing asset
ALTER TABLE faces ALTER COLUMN asset_id DROP NOT NULL;
