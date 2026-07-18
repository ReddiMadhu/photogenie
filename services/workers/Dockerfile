FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ services/
COPY packages/ packages/

CMD ["celery", "-A", "services.workers.celery_app", "worker", "--loglevel=info", "--concurrency=2"]
