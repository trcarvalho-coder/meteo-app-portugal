# Implantação do backend ECMWF

O widget "ECMWF — Previsão 72 h" no site publicado precisa de um backend que processa GRIB2 do bucket AWS `ecmwf-forecasts` (o browser não pode descarregar nem descodificar ficheiros GRIB2 globais).

## Como funciona

```
Browser (site publicado)  --->  Backend (server.py)  --->  S3 ecmwf-forecasts (AWS)
        JSON normalizado          GRIB2 + cfgrib/ecCodes        pedidos parciais
```

O frontend chama o backend através de `window.ECMWF_BACKEND_URL` (definida no `index.html`), com fallback para `http://127.0.0.1:8787` apenas em desenvolvimento (localhost); em produção não há fallback.

## Configuração do frontend

No `index.html`, antes dos módulos, defina o URL público do backend:

```html
<script>window.ECMWF_BACKEND_URL = 'https://meteo-backend.exemplo.pt';</script>
```

## Opções de hospedagem

### 1. Docker (qualquer VPS / container service)

```bash
docker build -t meteo-backend .
docker run -d --name meteo-backend \
  -p 8787:8787 \
  -e ALLOWED_ORIGIN=https://<seu-site> \
  -v meteo-cache:/data/cache \
  meteo-backend
```

Coloque um reverse proxy (nginx/Caddy/traefik) à frente para HTTPS, ou use um serviço gerido (ex.: Cloud Run, App Runner, Fly.io, Railway).

### 2. Google Cloud Run (exemplo)

```bash
gcloud run deploy meteo-backend \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGIN=https://<seu-site>
```

O Cloud Run fornece HTTPS automaticamente; use o URL gerado como `ECMWF_BACKEND_URL`.

### 3. Máquina virtual

```bash
pip install -r backend/requirements.txt
HOST=0.0.0.0 PORT=8787 ALLOWED_ORIGIN=https://<seu-site> \
  METEO_CACHE_DIR=/var/cache/meteo \
  python backend/server.py
```

Com `systemd` ou `supervisor` para manter o processo ativo, e reverse proxy para HTTPS.

## Variáveis de ambiente

| Variável | Default | Função |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind do servidor (usar `0.0.0.0` em container) |
| `PORT` | `8787` | Porta |
| `ALLOWED_ORIGIN` | `*` | Origem permitida em CORS — em produção, o domínio do site |
| `METEO_CACHE_DIR` | `/tmp/meteo-cache` | Diretório de cache de campos (montar volume persistente) |
| `METEO_CACHE_TTL` | `3600` | TTL do cache em segundos |

## Verificação

Depois de implantado, abra num navegador:

- `https://<backend>/api/health` → `{"status": "ok"}`
- `https://<backend>/api/run` → `{"run": "YYYYMMDD/HHZ"}`

## Custos e limites (sem valores inventados)

- Egress e armazenamento dependem do tráfego do site e do plano do provedor — verifique os preços do seu serviço.
- O S3 do ECMWF é gratuito e sem credenciais, mas aplica rate-limit ("503 Slow Down"); o cache de 1 h por campo mitiga isso.
- Recursos do backend: o processamento por campo é leve (campos de ~650 KB), mas com muitos utilizadores simultâneos a pré-carga de passos pode acumular memória — dimensione o container em conformidade.
