FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ services/
COPY packages/ packages/

EXPOSE 8002
CMD ["uvicorn", "services.identity.main:app", "--host", "0.0.0.0", "--port", "8002"]
