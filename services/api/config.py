"""
API Configuration — Pydantic Settings for all env vars.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Environment — "development" allows auth fallback; anything else fails closed
    environment: str = "development"

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
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Logging
    log_level: str = "INFO"

    @property
    def is_development(self) -> bool:
        return self.environment.lower() in {"development", "dev", "local"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
