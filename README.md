# Meteo Atlântico

Aplicação meteorológica com Esri ArcGIS Maps SDK for JavaScript, camadas geográficas derivadas da **Open-Meteo (modelo ECMWF IFS 0.25° open-data, sem custos)**, ECMWF Open Data (AWS) e alertas IPMA.

## Funcionalidades principais

- **Camadas geográficas Open-Meteo (ECMWF `ecmwf_ifs025`)**, pré-computadas e servidas como JSON estático (`data/om/`):
  - Isóbaras (pressão ao nível do mar, hPa) — **camada visível por defeito**
  - Vento a 10 m (km/h) e rajada de vento a 10 m (km/h)
  - Precipitação por janela (mm) e precipitação acumulada diária (mm)
  - Descargas elétricas (densidade, descargas/km²)
  - Temperatura máxima e mínima (°C)
- **Seleção múltipla**: um botão por parâmetro; várias camadas podem estar visíveis em simultâneo.
- **Time slider** (widget de pesquisa temporal) que percorre **todas as camadas selecionadas**: passos de **3 h até 72 h** e de **6 h após 72 h**, num horizonte de **15 dias** (73 instantes).
- **Área de interesse**: Atlântico Norte — limitado a oeste pelos EUA (meridiano 100°W) e a este pela Alemanha (meridiano 16°E), hemisfério norte (0–72°N). O mapa enquadra esta área por defeito.
- **Atualização automática 2×/dia** (06:30 e 18:30 UTC) via GitHub Action (`precompute-om.yml`), além de um botão "Atualizar agora" no painel.
- **Alertas IPMA em mapa**: polígonos das áreas oficiais coloridos por severidade (amarelo/laranja/vermelho) quando existem avisos ativos.
- **Interface adaptada a telemóvel** (rail compacto, painel inferior, timeline compacta).
- Consulta de dados históricos **removida** (ERA5 arquivado).

## Sobre a temporalidade pedida (15 dias)

A documentação oficial da Open-Meteo (verificada em 2026-10-31) confirma que o endpoint ECMWF aceita **`forecast_days=15`** (máx. 15 dias) e que o modelo `ecmwf_ifs025` (open-data, 0.25°) tem passos nativos de 3 h e 6 h, que a API normaliza para série horária. Assim foi **possível implementar a temporalidade exata pedida**: 3 h até 72 h e 6 h após 72 h, até 360 h — sem/eccompromisso. Não foi necessário sugerir uma alternativa.

## Arquitetura

- **Frontend**: HTML/JS (ES modules) + ArcGIS Maps SDK 5.1.26. Widgets à direita com comportamento de botão expansível.
- **Pipeline Open-Meteo** (`backend/openmeteo_grid.py` + `backend/precompute_om.py`): grelha 0.5° da AOI (~33 785 pontos, pedidos em lotes de 100 coordenadas, 1 pedido/lote), 15 dias, 8 camadas × 73 passos; publica `data/om/<run>/` + `latest.json` de forma atómica (só publica execuções completas).
- **Backend ECMWF AWS** (`backend/ecmwf_adapter.py`, `server.py`): GRIB2 do bucket S3 `ecmwf-forecasts` (CC-BY-4.0), 72 h, para o painel ECMWF de Portugal.
- **Camada central de unidades** (`js/meteo/units.js`): único ponto de conversão.
- **Catálogos**: `js/meteo/om-catalog.js` (camadas Open-Meteo + escalas) e `js/meteo/catalog.js` (ECMWF AWS).

## Execução

```bash
# Pipeline Open-Meteo (corre 2x/dia na GitHub Action; também local)
python backend/precompute_om.py

# Backend ECMWF AWS (desenvolvimento; loopback 127.0.0.1:8787)
pip install -r backend/requirements.txt
python backend/server.py

# Frontend (qualquer servidor estático)
npx serve .                     # ou python -m http.server
```

## Testes

```bash
npm test                       # vitest (camadas OM, isóbaras, timeline 15 dias, catálogo, unidades)
python -m pytest tests/ -q -m "not network"   # pytest (pipeline OM + recorte ECMWF AWS)
```

## Fontes

| Papel | Fonte | Identificação |
|---|---|---|
| Camadas 15 dias (vento, rajada, precipitação, descargas, temp. máx/mín, isóbaras) | Open-Meteo Forecast API, `models=ecmwf_ifs025` (ECMWF IFS open-data 0.25°, CC-BY 4.0) | "Open-Meteo (ECMWF IFS 0.25°)" |
| Previsão 72 h (painel Portugal) | ECMWF Open Data — AWS `s3://ecmwf-forecasts`, IFS HRES oper 0.25°, CC-BY-4.0 | "ECMWF Open Data (AWS)" |
| Atual + previsões de local | Open-Meteo (uso não comercial, < 10 000 chamadas/dia) | "Open-Meteo" |
| Alertas (mapa + painel) | IPMA open-data | "IPMA" |

## Licenças e atribuições

- ECMWF Open Data (via Open-Meteo e AWS): CC-BY-4.0 + ECMWF Terms of Use. Citação: "ECMWF real-time forecasts, https://doi.org/10.21957/open-data".
- Open-Meteo: uso não comercial, menos de 10 000 chamadas/dia, CC BY 4.0.
- IPMA open-data: termos IPMA. Esri ArcGIS: termos Esri.
