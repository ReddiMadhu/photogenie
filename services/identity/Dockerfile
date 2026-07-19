FROM photogenic-base:latest

WORKDIR /app

COPY services/ services/
COPY packages/ packages/

EXPOSE 8002
CMD ["uvicorn", "services.identity.main:app", "--host", "0.0.0.0", "--port", "8002"]
