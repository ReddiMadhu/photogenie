-- =============================================================================
-- Enterprise Face Search Platform — PostgreSQL Initialization
-- This file is mounted into the Postgres container and runs on first boot.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- The main schema is loaded from 001_initial_schema.sql
-- (also mounted in /docker-entrypoint-initdb.d/)
