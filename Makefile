# =============================================================================
# Enterprise Face Search Platform — Makefile
# =============================================================================

COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env
PROJECT := photogenic

.PHONY: dev up down build migrate test eval logs clean qdrant-init

# Boot the full platform (builds + starts all services)
dev: build up migrate qdrant-init
	@echo "✅  Platform running. API: http://localhost:8000  Web: http://localhost:5173"

# Start all services
up:
	$(COMPOSE) -p $(PROJECT) up -d

# Stop all services
down:
	$(COMPOSE) -p $(PROJECT) down

# Rebuild all images
build:
	$(COMPOSE) -p $(PROJECT) build

# Run database migrations
migrate:
	$(COMPOSE) -p $(PROJECT) exec -T postgres psql -U $(POSTGRES_USER) -d $(POSTGRES_DB) \
		-f /docker-entrypoint-initdb.d/001_initial_schema.sql || true

# Initialize Qdrant collections
qdrant-init:
	$(COMPOSE) -p $(PROJECT) exec -T api python -m infra.qdrant.init_collections || \
		python infra/qdrant/init_collections.py

# Run tests
test:
	$(COMPOSE) -p $(PROJECT) exec -T api python -m pytest tests/ -v --tb=short

# Run evaluation harness
eval:
	$(COMPOSE) -p $(PROJECT) exec -T api python -m packages.eval.harness

# Tail logs
logs:
	$(COMPOSE) -p $(PROJECT) logs -f

# Clean everything (volumes + images)
clean:
	$(COMPOSE) -p $(PROJECT) down -v --rmi local
	@echo "🧹  Cleaned all containers, volumes, and local images."

# Individual service targets
.PHONY: api workers ml identity retrieval web

api:
	$(COMPOSE) -p $(PROJECT) up -d api

workers:
	$(COMPOSE) -p $(PROJECT) up -d workers

ml:
	$(COMPOSE) -p $(PROJECT) up -d ml-inference

identity:
	$(COMPOSE) -p $(PROJECT) up -d identity

retrieval:
	$(COMPOSE) -p $(PROJECT) up -d retrieval

web:
	$(COMPOSE) -p $(PROJECT) up -d web
