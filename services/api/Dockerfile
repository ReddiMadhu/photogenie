FROM photogenic-base:latest

WORKDIR /app

COPY services/ services/
COPY packages/ packages/

EXPOSE 8000
CMD ["uvicorn", "services.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
