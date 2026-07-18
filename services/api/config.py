"""
API Configuration — Pydantic Settings for all env vars.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Postgres
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "photogenic"
    postgres_user: str = "photogenic"
    postgres_password: str = "changeme_pg_password"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Qdrant
    qdrant_host: str = "qdrant"
    qdrant_port: int = 6333

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "changeme_minio_password"
    minio_bucket: str = "photogenic"
    minio_use_ssl: bool = False

    # JWT
    jwt_secret: str = "changeme_jwt_secret_at_least_32_chars"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60

    # Service URLs
    ml_inference_url: str = "http://ml-inference:8001"
    identity_service_url: str = "http://identity:8002"
    retrieval_service_url: str = "http://retrieval:8003"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
