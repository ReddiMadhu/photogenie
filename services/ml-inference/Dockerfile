FROM photogenic-base:latest

WORKDIR /app

COPY services/ services/
COPY packages/ packages/

EXPOSE 8001
CMD ["uvicorn", "services.ml_inference.main:app", "--host", "0.0.0.0", "--port", "8001"]
