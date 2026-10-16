"""Backend de processamento meteorológico — ECMWF Open Data (AWS).

Pipeline:
1. Descoberta de execuções no bucket S3 ecmwf-forecasts (sem credenciais).
2. Seleção da execução completa mais recente (00z ou 12z) que cubra 168 h.
3. Obtenção parcial por campo via índices (ecmwf-opendata usa HTTP range requests).
4. Recorte para a área de interesse (Portugal continental + Madeira + Açores).
5. Normalização de unidades e semântica temporal.
6. Publicação de JSON para o frontend (grelha regular + valores).
"""

from __future__ import annotations

import io
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
import xarray as xr

BUCKET = "https://ecmwf-forecasts.s3.eu-central-1.amazonaws.com"
NS = "{http://s3.amazonaws.com/doc/2006-03-01/}"

# Área de interesse: Portugal continental, Madeira e Açores.
# (sul, norte) em graus.
AOI_LAT = (30.0, 44.0)
# (oeste, leste) em graus, convenção -180..180.
AOI_LON = (-32.0, -6.0)

CACHE_DIR = os.environ.get("METEO_CACHE_DIR", "/tmp/meteo-cache")
CACHE_TTL_SECONDS = int(os.environ.get("METEO_CACHE_TTL", "3600"))
PROCESSING_VERSION = "v1"

# Passos nativos: 3 h até 144 h; 6 h até 168 h (validado no bucket em 2026-10-16).
def native_steps():
    steps = [h for h in range(0, 145, 3)]
    steps += [h for h in range(150, 169, 6)]
    return steps


class FetchError(Exception):
    pass


def _http_get(url: str, retries: int = 3, backoff: float = 30.0) -> bytes:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "meteo-app-portugal/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(backoff)
    raise FetchError(f"GET {url}: {last}")


def list_prefix(prefix: str) -> list[dict]:
    """Lista objetos S3 sob um prefixo. Retorna [(key, size)]."""
    keys = []
    token = None
    while True:
        url = f"{BUCKET}?list-type=2&prefix={urllib.parse.quote(prefix)}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        data = _http_get(url)
        root = ET.fromstring(data)
        for c in root.findall(f"{NS}Contents"):
            keys.append({
                "key": c.findtext(f"{NS}Key"),
                "size": int(c.findtext(f"{NS}Size")),
            })
        token_el = root.find(f"{NS}NextContinuationToken")
        if token_el is None:
            break
        token = token_el.text
    return keys


def discover_runs() -> list[dict]:
    """Descobre execuções 00z/12z disponíveis, mais recentes primeiro."""
    today = datetime.now(timezone.utc)
    runs = []
    for d in range(0, 4):
        day = today - timedelta(days=d)
        date_str = day.strftime("%Y%m%d")
        objects = list_prefix(f"{date_str}/")
        hours = sorted({o["key"].split("/")[1] for o in objects if o["key"].count("/") >= 1})
        for h in hours:
            if h in ("00z", "12z"):
                runs.append({"date": date_str, "hour": h})
    return runs


def run_has_full_horizon(run: dict) -> bool:
    """Uma execução cobre 168 h se existirem objetos até -168h- (qualquer stream)."""
    prefix = f"{run['date']}/{run['hour']}/ifs/0p25/oper/"
    try:
        objects = list_prefix(prefix)
    except FetchError:
        return False
    steps = set()
    for o in objects:
        m = re.search(r"-(\d+)h-oper-fc\.grib2$", o["key"])
        if m:
            steps.add(int(m.group(1)))
    return max(steps, default=-1) >= 168


def select_run() -> dict | None:
    """Seleciona a execução 00z/12z completa mais recente. Não escolhe
    automaticamente a mais recente se estiver incompleta."""
    for run in discover_runs():
        if run_has_full_horizon(run):
            return run
    return None


def _cache_path(run: dict, param: str, step: int) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(
        CACHE_DIR,
        f"{run['date']}{run['hour']}-{param}-{step}h-{PROCESSING_VERSION}.npz",
    )


def _fetch_field(run: dict, param: str, step: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Obtém um campo GRIB2 (via ecmwf-opendata) e devolve (lats, lons, valores).

    Usa pedidos parciais: o pacote ecmwf-opendata lê o índice e descarrega
    apenas a mensagem GRIB do parâmetro/passo pedidos (validado: ~650 kB por
    campo em vez de ~140 MB por ficheiro).
    """
    cache = _cache_path(run, param, step)
    if os.path.exists(cache) and (time.time() - os.path.getmtime(cache)) < CACHE_TTL_SECONDS:
        with np.load(cache) as z:
            return z["lats"], z["lons"], z["values"]

    from ecmwf.opendata import Client

    client = Client(model="ifs", source="aws")
    target = os.path.join(CACHE_DIR, f"tmp-{param}-{step}.grib2")
    client.retrieve(
        request={
            "date": run["date"],
            "time": "0000" if run["hour"] == "00z" else "1200",
            "type": "fc",
            "stream": "oper",
            "step": step,
            "param": param,
            "target": target,
        }
    )
    ds = xr.open_dataset(target, engine="cfgrib")
    var = list(ds.data_vars)[0]
    da = ds[var]

    lats = da.latitude.values.astype(np.float64)
    lons = da.longitude.values.astype(np.float64)
    values = da.values.astype(np.float64)

    np.savez_compressed(cache, lats=lats, lons=lons, values=values)
    os.remove(target)
    return lats, lons, values


def _crop(lats, lons, values):
    """Recorta a área de interesse.

    Latitudes descendentes. Longitudes em -180..180 (cfgrib normaliza a
    convenção 0..360 do GRIB) — a máscara funciona para ambas.
    """
    lat_s, lat_n = AOI_LAT
    lon_w, lon_e = AOI_LON
    lat_mask = (lats <= lat_n) & (lats >= lat_s)
    if lons.min() >= 0:  # convenção 0..360
        lon_mask = (lons >= lon_w % 360) & (lons <= lon_e % 360)
    else:  # convenção -180..180
        lon_mask = (lons >= lon_w) & (lons <= lon_e)
    return lats[lat_mask], lons[lon_mask], values[np.ix_(lat_mask, lon_mask)]


def _normal_lon(lon360: float) -> float:
    return lon360 - 360 if lon360 > 180 else lon360


def field_json(run: dict, variable: str, step: int) -> dict:
    """Devolve um campo normalizado em JSON para o frontend."""
    if variable == "temperature":
        params = ["2t"]
    elif variable == "windSpeed":
        params = ["10u", "10v"]
    elif variable == "precipitation":
        params = ["tp"]
    else:
        raise ValueError(f"Variável desconhecida: {variable}")

    fields = {}
    for p in params:
        lats, lons, vals = _fetch_field(run, p, step)
        lats, lons, vals = _crop(lats, lons, vals)
        fields[p] = vals

    if variable == "temperature":
        values = fields["2t"] - 273.15  # K -> °C
        unit = "°C"
        temporal = "instantâneo"
    elif variable == "windSpeed":
        u, v = fields["10u"], fields["10v"]
        values = np.hypot(u, v) * 3.6  # m/s -> km/h
        unit = "km/h"
        temporal = "instantâneo"
    else:  # precipitation
        values = fields["tp"] * 1000.0  # m -> mm (acumulado desde a execução)
        unit = "mm"
        temporal = "acumulado desde a execução"

    lons_norm = [_normal_lon(float(x)) for x in lons]

    return {
        "variable": variable,
        "unit": unit,
        "temporalType": temporal,
        "source": "ECMWF Open Data (AWS) — IFS oper 0.25°",
        "run": f"{run['date']}/{run['hour']}",
        "step": step,
        "validTimeUtc": _valid_time(run, step).isoformat() + "Z",
        "spatialResolution": "0.25°",
        "nativeStep": step in native_steps(),
        "lats": [round(float(x), 4) for x in lats],
        "lons": [round(float(x), 4) for x in lons_norm],
        "values": [[None if (isinstance(x, float) and math.isnan(x)) else round(float(x), 2)
                    for x in row] for row in values],
    }


def _valid_time(run: dict, step: int) -> datetime:
    hour = 0 if run["hour"] == "00z" else 12
    base = datetime.strptime(run["date"], "%Y%m%d").replace(tzinfo=timezone.utc) + timedelta(hours=hour)
    return base + timedelta(hours=step)


def precipitation_increment(run: dict, step: int) -> dict | None:
    """Incremento de precipitação entre o passo anterior nativo e este.

    tp é acumulado desde a execução: incremento = tp(step) - tp(prev).
    Não soma acumulados; devolve None se algum campo estiver indisponível.
    """
    steps = native_steps()
    if step not in steps:
        return None
    idx = steps.index(step)
    prev = steps[idx - 1] if idx > 0 else 0
    cur = field_json(run, "precipitation", step)
    if prev == 0:
        inc_values = cur["values"]  # acumulado desde a execução no passo 0
    else:
        prevj = field_json(run, "precipitation", prev)
        inc_values = []
        for r_cur, r_prev in zip(cur["values"], prevj["values"]):
            row = []
            for a, b in zip(r_cur, r_prev):
                if a is None or b is None:
                    row.append(None)
                else:
                    d = a - b
                    row.append(round(max(0.0, d), 2) if d >= -1e-9 else None)
            inc_values.append(row)
    cur = dict(cur)
    cur["values"] = inc_values
    cur["temporalType"] = f"incremento no intervalo de {prev}h a {step}h (diferença de acumulados)"
    return cur
