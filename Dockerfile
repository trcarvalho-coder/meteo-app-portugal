FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/

# Cache de campos GRIB fora do sistema de ficheiros efemero
ENV METEO_CACHE_DIR=/data/cache
RUN mkdir -p /data/cache
VOLUME ["/data/cache"]

# Em producao: HOST=0.0.0.0 e ALLOWED_ORIGIN=https://<seu-dominio>
ENV HOST=0.0.0.0
ENV PORT=8787

EXPOSE 8787

CMD ["python", "backend/server.py"]
