"""Pipeline de pre-computacao das camadas geograficas Open-Meteo (modelo ECMWF).

Fonte: Open-Meteo Forecast API, endpoint /v1/forecast com models=ecmwf_ifs025
(ECMWF IFS open-data 0.25, CC-BY 4.0; uso nao comercial, < 10 000 chamadas/dia,
sem chave de API). A documentacao oficial confirma:
- horizonte maximo de 15 dias (forecast_days=15 -> 360 horas);
- a API normaliza os passos nativos do modelo (3 h / 6 h) para uma serie
  horaria; nos amostramos nos passos efectivos pedidos pela aplicacao;
- variaveis horarias usadas: wind_speed_10m, wind_gusts_10m (maximo das 3 h
  precedentes), precipitation (soma da hora precedente), pressure_msl,
  temperature_2m, lightning_density (descargas por km2) e, diaria,
  temperature_2m_max / temperature_2m_min / precipitation_sum.

Area de interesse (Atlântico Norte): limitado a oeste pelos EUA (meridiano
-100) e a este pela Alemanha (meridiano 16E); apenas o hemisferio norte.
A grelha e amostrada a 0.5 (mais fina que a resolucao nativa 0.25 do modelo,
sem inventar precisao: os valores vem interpolados pela propria API).

Temporalidade (pedido do utilizador):
- passos de 3 h desde 0 h ate as 72 h (inclusivo) -> 25 instantes;
- passos de 6 h apos as 72 h, ate 360 h (15 dias) -> 48 instantes;
- num total de 73 instantes por execucao.

Previsao de precipitacao e de descargas eletricas e por janela (3 h ate 72 h,
6 h apos 72 h), nao instantanea: os valores representam o intervalo que termina
no instante indicado.
"""

from __future__ import annotations

import json
import math
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

OM_BASE = "https://api.open-meteo.com/v1/forecast"
MODEL = "ecmwf_ifs025"

# Area de interesse: Atlantico Norte, oeste pelos EUA (-100), este pela
# Alemanha (16E); hemisferio norte (0..72N).
AOI_LAT = (0.0, 72.0)
AOI_LON = (-100.0, 16.0)
GRID_STEP = 0.5

FORECAST_DAYS = 15
MAX_STEP_HOURS = FORECAST_DAYS * 24  # 360

# Variaveis horarias por camada (nomes Open-Meteo).
HOURLY_VARS = {
    "wind": "wind_speed_10m",
    "gust": "wind_gusts_10m",
    "precipitation": "precipitation",
    "lightning": "lightning_density",
    "temperature": "temperature_2m",
    "pressure": "pressure_msl",
}
DAILY_VARS = {
    "tempMax": "temperature_2m_max",
    "tempMin": "temperature_2m_min",
    "precipAccum": "precipitation_sum",
}

# Mapeamento camada -> variavel(is) pedidas; None = camada derivada (isobaras).
LAYER_VARS = {
    "isobars": None,          # isolinhas de pressure_msl (desenhadas no cliente)
    "wind": ["wind"],
    "gust": ["gust"],
    "precipitation": ["precipitation"],
    "precipAccum": ["precipAccum"],
    "lightning": ["lightning"],
    "tempMax": ["tempMax"],
    "tempMin": ["tempMin"],
}

BATCH_POINTS = 100          # pontos por pedido (limite de URL / resposta)
REQUEST_SLEEP = 1.2         # segundos entre pedidos (limite 10 000 chamadas/dia)
REQUEST_RETRIES = 4


def timeline_steps() -> list[int]:
    """Passos efetivos: 3 h ate 72 h; 6 h apos 72 h ate 360 h (15 dias)."""
    steps = list(range(0, 73, 3))
    steps.extend(range(78, MAX_STEP_HOURS + 1, 6))
    return steps


def is_accum_window(step: int) -> int:
    """Duracao da janela (h) da previsao por intervalo que termina em step."""
    return 3 if step <= 72 else 6


def grid_points() -> tuple[list[float], list[float]]:
    """Grelha regular da area de interesse (lats ascendentes, lons -180..180)."""
    lat_s, lat_n = AOI_LAT
    lon_w, lon_e = AOI_LON
    lats = [round(lat_s + i * GRID_STEP, 2) for i in range(int((lat_n - lat_s) / GRID_STEP) + 1)]
    lons = [round(lon_w + j * GRID_STEP, 2) for j in range(int((lon_e - lon_w) / GRID_STEP) + 1)]
    return lats, lons


def _http_get_json(url: str) -> dict:
    last = None
    for attempt in range(REQUEST_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "meteo-app-portugal/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(min(30, 5 * (attempt + 1)))
    raise RuntimeError(f"GET {url}: {last}")


def fetch_grid_batch(lats: list[float], lons: list[float]) -> list[dict]:
    """Um pedido Open-Meteo para ate BATCH_POINTS coordenadas.

    Devolve a lista de respostas (uma por coordenada, na mesma ordem), cada uma
    com hourly/daily completos para os 15 dias.
    """
    points = [(la, lo) for la in lats for lo in lons]
    results: list[dict | None] = [None] * len(points)
    for start in range(0, len(points), BATCH_POINTS):
        batch = points[start:start + BATCH_POINTS]
        params = {
            "latitude": ",".join(f"{p[0]:.2f}" for p in batch),
            "longitude": ",".join(f"{p[1]:.2f}" for p in batch),
            "models": MODEL,
            "hourly": ",".join(sorted(set(HOURLY_VARS.values()))),
            "daily": ",".join(sorted(set(DAILY_VARS.values()))),
            "forecast_days": str(FORECAST_DAYS),
            "timezone": "UTC",
            "timeformat": "iso8601",
            "wind_speed_unit": "kmh",
            "temperature_unit": "celsius",
            "precipitation_unit": "mm",
            "cell_selection": "nearest",
        }
        url = f"{OM_BASE}?{urllib.parse.urlencode(params)}"
        data = _http_get_json(url)
        time.sleep(REQUEST_SLEEP)
        if isinstance(data, list):
            for i, item in enumerate(data):
                if i < len(batch):
                    results[start + i] = item
        else:
            # pedido de ponto unico devolve objeto (nao usado aqui, por seguranca)
            results[start] = data
    return [r for r in results if r is not None]


def fetch_grid() -> dict:
    """Descarrega a grelha completa da AOI.

    Devolve {"lats": [...], "lons": [...], "points": [resposta por ponto]} onde
    cada resposta tem hourly.time (ISO UTC) e hourly.<var> + daily.
    """
    lats, lons = grid_points()
    all_points = fetch_grid_batch(lats, lons)
    expected = len(lats) * len(lons)
    if len(all_points) != expected:
        raise RuntimeError(f"Grelha incompleta: {len(all_points)}/{expected} pontos")
    return {"lats": lats, "lons": lons, "points": all_points}


def _hour_index(iso_times: list[str], step: int, run_base: datetime) -> int | None:
    """Indice da hora correspondente a run_base + step na lista hourly.time."""
    target = (run_base + timedelta(hours=step)).strftime("%Y-%m-%dT%H:%M")
    for i, t in enumerate(iso_times):
        if t.startswith(target):
            return i
    return None


def run_base_from_hourly(times: list[str]) -> datetime | None:
    if not times:
        return None
    return datetime.strptime(times[0], "%Y-%m-%dT%H:%M").replace(tzinfo=timezone.utc)


def field_for_layer(grid: dict, layer: str, step: int, run_base: datetime) -> dict | None:
    """Campo (grelha 2D) de uma camada num passo, ou None se indisponivel.

    Camadas instantaneas (wind, gust, temperature, pressure, tempMax, tempMin)
    usam o indice horario do instante. Camadas por janela (precipitation,
    lightning, precipAccum) somam os intervalos da janela que termina no
    instante (3 h ate 72 h; 6 h apos 72 h).
    """
    lats, lons, points = grid["lats"], grid["lons"], grid["points"]
    nlat, nlon = len(lats), len(lons)
    if step > MAX_STEP_HOURS:
        return None
    window = is_accum_window(step)
    values: list[list[float | None]] = [[None] * nlon for _ in range(nlat)]

    hourly_var = HOURLY_VARS.get(layer)
    daily_var = DAILY_VARS.get(layer)
    accum = layer in ("precipitation", "lightning", "precipAccum")

    for p_idx, point in enumerate(points):
        i = p_idx // nlon
        j = p_idx % nlon
        hourly = point.get("hourly") or {}
        times = hourly.get("time") or []
        if not times:
            continue
        idx = _hour_index(times, step, run_base)
        if idx is None:
            continue
        if hourly_var:
            series = hourly.get(hourly_var) or []
            if accum:
                lo = max(0, idx - window + 1)
                vals = [v for v in series[lo:idx + 1] if v is not None]
                values[i][j] = round(sum(vals), 2) if vals else None
            else:
                v = series[idx] if idx < len(series) else None
                values[i][j] = round(v, 2) if v is not None else None
        elif daily_var:
            daily = point.get("daily") or {}
            dtimes = daily.get("time") or []
            series = daily.get(daily_var) or []
            day = (run_base + timedelta(hours=step)).strftime("%Y-%m-%d")
            di = None
            for k, t in enumerate(dtimes):
                if t == day:
                    di = k
                    break
            if di is not None and di < len(series) and series[di] is not None:
                values[i][j] = round(series[di], 2)
    return {
        "layer": layer,
        "step": step,
        "windowHours": window if accum else 0,
        "unit": layer_unit(layer),
        "lats": lats,
        "lons": lons,
        "values": values,
    }


def layer_unit(layer: str) -> str:
    return {
        "isobars": "hPa",
        "wind": "km/h",
        "gust": "km/h",
        "precipitation": "mm",
        "precipAccum": "mm",
        "lightning": "descargas/km²",
        "tempMax": "°C",
        "tempMin": "°C",
    }.get(layer, "")


def valid_time_iso(run_base: datetime, step: int) -> str:
    return (run_base + timedelta(hours=step)).isoformat().replace("+00:00", "Z")


def write_run(out_dir: str) -> dict:
    """Descarrega a grelha e escreve data/om/<run>/<layer>-<step>h.json + index.

    Devolve o indice escrito. Falha (excecao) se algum passo/camada ficar
    incompleto: o chamador nao deve atualizar latest.json nesse caso.
    """
    grid = fetch_grid()
    first = grid["points"][0]
    times = (first.get("hourly") or {}).get("time") or []
    run_base = run_base_from_hourly(times)
    if run_base is None:
        raise RuntimeError("Sem hourly.time na resposta Open-Meteo")
    run_id = run_base.strftime("%Y%m%d%H") + "z"

    dest = os.path.join(out_dir, run_id)
    tmp = dest + ".tmp"
    os.makedirs(tmp, exist_ok=True)

    steps = timeline_steps()
    layers = list(LAYER_VARS.keys())
    written = 0
    for step in steps:
        for layer in layers:
            if layer == "isobars":
                # isobaras derivam de pressure no cliente; ainda assim gravamos
                # o campo de pressao para o desenho das isolinhas
                field = field_for_layer(grid, "pressure", step, run_base)
            else:
                field = field_for_layer(grid, layer, step, run_base)
            if field is None:
                continue
            field["source"] = f"Open-Meteo (modelo {MODEL}, ECMWF IFS open-data 0.25°, CC-BY 4.0)"
            field["model"] = MODEL
            field["run"] = run_base.strftime("%Y%m%d/%H") + "z"
            field["validTimeUtc"] = valid_time_iso(run_base, step)
            field["spatialResolution"] = f"{GRID_STEP}° (grelha de amostragem; nativa 0.25°)"
            field["accumWindow"] = is_accum_window(step) if layer in ("precipitation", "lightning", "precipAccum") else None
            fname = ("isobars" if layer == "isobars" else layer)
            with open(os.path.join(tmp, f"{fname}-{step}h.json"), "w", encoding="utf-8") as fh:
                json.dump(field, fh, separators=(",", ":"))
            written += 1

    expected = len(steps) * len(layers)
    if written != expected:
        raise RuntimeError(f"Execucao incompleta: {written}/{expected} campos escritos")

    index = {
        "source": "Open-Meteo",
        "model": MODEL,
        "run": run_base.strftime("%Y%m%d/%H") + "z",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "forecastDays": FORECAST_DAYS,
        "maxStep": MAX_STEP_HOURS,
        "steps": steps,
        "layers": layers,
        "aoi": {"lat": list(AOI_LAT), "lon": list(AOI_LON), "gridStep": GRID_STEP},
        "note": "Passos de 3 h ate 72 h; 6 h apos 72 h. Precipitacao/descargas por janela de 3/6 h.",
    }
    with open(os.path.join(tmp, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    if os.path.exists(dest):
        import shutil
        shutil.rmtree(dest)
    os.replace(tmp, dest)
    return index
