FROM photogenic-base:latest

WORKDIR /app

COPY services/ services/
COPY packages/ packages/

EXPOSE 8003
CMD ["uvicorn", "services.retrieval.main:app", "--host", "0.0.0.0", "--port", "8003"]
