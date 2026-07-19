FROM photogenic-base:latest

WORKDIR /app

COPY services/ services/
COPY packages/ packages/

CMD ["celery", "-A", "services.workers.celery_app", "worker", "--loglevel=info", "--concurrency=2"]
