FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN pip install --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install --no-deps silero-stress==1.4

COPY server.py pronunciations.json ./

EXPOSE 8080

CMD ["python", "/app/server.py"]
