# Meteo Portugal

Aplicação meteorológica com Esri ArcGIS Maps SDK for JavaScript, IPMA, Open-Meteo e ECMWF Open Data (AWS).

## Arquitetura

- **Frontend**: HTML/JS (ES modules) + ArcGIS Maps SDK 5.1.26. Widgets à direita com comportamento de botão expansível.
- **Backend** (`backend/`): Python; processa GRIB2 do bucket S3 `ecmwf-forecasts` (ECMWF Open Data AWS, CC-BY-4.0) com `ecmwf-opendata` + `cfgrib`/ecCodes/xarray. Liga em loopback (`127.0.0.1:8787`).
- **Camada central de unidades** (`js/meteo/units.js`): único ponto de conversão (m/s para km/h, K para Celsius, m para mm, u/v para magnitude). Nenhuma conversão dupla.
- **Catálogo de variáveis** (`js/meteo/catalog.js`): nome, fonte, paramId, unidades, altura, tipo temporal, resolução, regras de valores ausentes e escalas/legendas.

## Execução

```bash
# Backend (processa GRIB2 ECMWF, cache em /tmp/meteo-cache)
pip install -r backend/requirements.txt
python backend/server.py        # loopback 127.0.0.1:8787

# Frontend (qualquer servidor estático)
npx serve .                     # ou python -m http.server
```

## Testes

```bash
npm test                       # vitest (unidades, catálogo, política temporal)
python -m pytest tests/ -q    # pytest (recorte, passos, validade, incrementos)
```

## Diagnóstico Open-Meteo (corrigido)

**Causa encontrada e evidência**: a API Open-Meteo devolve `wind_speed_10m`/`wind_gusts_10m` em **km/h** por defeito (`wind_speed_unit` default `kmh`, cf. documentação oficial). O código multiplicava os valores por 3,6 uma segunda vez em `js/app.js` e `js/config.js` (`Helpers.formatWindSpeed`) e nos painéis Open-Meteo — inflacionando os valores 3,6× (ex.: 20 km/h reais apresentados como 72 km/h), compatível com os "ventos excessivos" observados.

**Correção**: pedidos com unidades explícitas (`wind_speed_unit=kmh`, `temperature_unit=celsius`, `precipitation_unit=mm`) e normalização única em `js/meteo/units.js` (`normalizeWindSpeed(value, 'kmh')` devolve o valor sem conversão). Testes comprovam: 10 m/s = 36 km/h; valores já em km/h não são reconvertidos; velocidade não é trocada com rajada; nulos não se tornam zero.

## Fontes

| Papel | Fonte | Identificação |
|---|---|---|
| Previsão 72 h (camadas) | ECMWF Open Data — AWS `s3://ecmwf-forecasts` (eu-central-1), IFS HRES oper 0.25°, CC-BY-4.0 | "ECMWF Open Data (AWS)" |
| Atual + rajadas | Open-Meteo (fonte secundária identificada; rajadas indisponíveis no subconjunto AWS) | "Open-Meteo" |
| Alertas | IPMA open-data | "IPMA" |
| Histórico | Open-Meteo Historical API — ERA5 (reanálise 0.25°, desde 1940). Fonte interina identificada; ARCO-ERA5/BigQuery pendente | "ERA5 — Histórico" |

## Mapeamento de variáveis (validado na fonte em 2026-10-16, execução 20261016/00z)

| Variável | Identificador | paramId | Unidade original → apresentada | Tipo temporal |
|---|---|---|---|---|
| Temperatura a 2 m | `2t` | 167 | K → °C | instantâneo |
| Vento a 10 m | `10u`,`10v` | 165, 166 | m/s (componentes) → km/h (magnitude) | instantâneo |
| Precipitação | `tp` | 228 | m → mm | acumulado desde a execução; incremento por diferença |
| Rajada a 10 m | — | — | **Indisponível no produto AWS publicado** (validado por tentativa de obtenção); fallback secundário: Open-Meteo `wind_gusts_10m` (km/h, máximo horário) | — |

**Rajadas e extremos**: o subconjunto ECMWF publicado no AWS (stream `oper`, 0.25°) não inclui 10fg nem mn2t/mx2t. Não são usadas substituições silenciosas: a rajada do widget "Atual" é identificada como Open-Meteo (máximo horário, não comparável a máximos de 3/6 h).

## Resolução e passos efetivos (validados por download real)

- Espacial: 0,25° (grelha global 721×1440; recortada para 30–44°N, 32°W–6°W = 57×105 células, cobrindo Portugal continental, Madeira e Açores).
- Temporal: passos nativos de **3 h até 72 h** (25 instantes, 0 h a 72 h).
- Execução: 00z ou 12z IFS HRES `oper`, a mais recente **completa** que cobre 72 h (não se escolhe automaticamente a mais recente se incompleta).

## Política temporal por variável

- **Instantâneos** (temperatura, vento): passos nativos de 3 h, 0..72 h.
- **Precipitação**: apenas passos nativos; incrementos por diferença de acumulados `tp(step) − tp(prev)`; nunca soma de acumulados; sem desagregação artificial de 6 h em 3 h.
- **Rajadas/extremos**: janelas estatísticas preservadas; nenhuma interpolação de máximos como instantâneos.

## Cache e atualização

- Backend: cache por (execução, parâmetro, passo, versão de processamento) em `/tmp/meteo-cache` (TTL 1 h, configurável).
- Frontend: cache de campos por (variável, passo) com TTL 1 h; `AbortController` cancela pedidos obsoletos; a última camada válida permanece visível durante falhas, identificada como anterior.

## Estado das integrações

- **Implementado e validado**: auditoria/correção Open-Meteo (30 testes JS), remoção do painel esquerdo, widgets expansíveis acessíveis (`aria-expanded`, teclado, foco visível), backend ECMWF AWS (14 testes Python; downloads e decodificação reais validados: 2t Lisboa 22,0 °C; vento máx 50,4 km/h na área; incremento 0–3 h até 10,16 mm), linha temporal tri-horária 25 instantes/72 h, legendas por variável com fontes/execuções/validades, atribuições e licenças.
- **Implementado mas não validado no ambiente disponível**: renderização das camadas no mapa ArcGIS e pop-ups (requer browser; o SDK ArcGIS e o backend não são executáveis no sandbox de CI).
- **Implementado (fonte interina)**: ERA5 histórico via Open-Meteo Historical API (reanálise ERA5, 0.25°, 1940→), com seleção de período, fonte identificada e contexto temporal independente. **Pendente**: ARCO-ERA5/BigQuery (exige projeto GCP com faturação ativa) — quando disponível, substitui a fonte interina.
- **Não suportado pela fonte**: rajada a 10 m no subconjunto AWS (usar fallback Open-Meteo identificado); extremos nativos mn2t/mx2t no AWS.

## Limitações conhecidas

- A linha temporal apresenta validade = execução (run) + passo, lida do índice `latest.json`.
- O aviso "Only use ES modules from the ArcGIS CDN for testing" do SDK ArcGIS é informativo: produção deve usar `@arcgis/core` via npm; o CDN fica apenas para testes.
- Causa documentada da execução incompleta 2026101600z (logs da Action 38888987544): a job foi cancelada ao atingir `timeout-minutes: 120` durante um retry do S3 ("503 Slow Down ... Retrying in 120 seconds", tentativa 2 de 500) nos passos ~69-72 h. O índice anunciava 0-168 h mas a pasta só tinha 0-30 h. Com o horizonte de 72 h, timeout de 45 min, validação pré-commit e `availableSteps`, o índice apenas anuncia passos efetivamente escritos.
- O recorte espacial desenha células nativas 0,25° (sem interpolação para raster contínuo); a consulta pontual usa a célula mais próxima.
- O S3 do ECMWF aplica "503 Slow Down" em pedidos frequentes; o backend repete com backoff (o que pode tornar o primeiro passo lento).

## Licenças e atribuição

- ECMWF Open Data (AWS): CC-BY-4.0 + ECMWF Terms of Use. Citação: "ECMWF real-time forecasts, https://doi.org/10.21957/open-data".
- Open-Meteo: uso não comercial, menos de 10 000 chamadas/dia.
- IPMA open-data: termos IPMA. Esri ArcGIS: termos Esri.
