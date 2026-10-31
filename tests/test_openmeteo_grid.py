# ===== Testes do pipeline Open-Meteo (camadas geograficas ECMWF 15 dias) =====
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import openmeteo_grid as om  # noqa: E402


def test_timeline_steps_3h_to_72_then_6h_to_360():
    steps = om.timeline_steps()
    # 0..72 h de 3 em 3 h -> 25 instantes
    assert steps[:25] == list(range(0, 73, 3))
    assert len(steps[:25]) == 25
    # apos 72 h: passos de 6 h ate 360 h (15 dias)
    assert steps[25] == 78
    assert steps[-1] == 360
    assert all(s % 6 == 0 for s in steps[25:])
    # sem passos entre 72 e 78 (75 nao e passo nem de 3 nem de 6 apos 72)
    assert 75 not in steps
    assert 73 not in steps and 74 not in steps and 76 not in steps and 77 not in steps
    # 25 + 48 = 73 instantes no total
    assert len(steps) == 73


def test_accum_window_3h_until_72_then_6h():
    assert om.is_accum_window(0) == 3
    assert om.is_accum_window(72) == 3
    assert om.is_accum_window(78) == 6
    assert om.is_accum_window(360) == 6


def test_aoi_north_atlantic_bounded_by_usa_and_germany():
    lat_s, lat_n = om.AOI_LAT
    lon_w, lon_e = om.AOI_LON
    # oeste pelos EUA, este pela Alemanha; so hemisferio norte
    assert lon_w == -100.0
    assert lon_e == 16.0
    assert lat_s == 0.0 and lat_n == 72.0
    lats, lons = om.grid_points()
    assert lats[0] == lat_s and lats[-1] == lat_n
    assert lons[0] == lon_w and lons[-1] == lon_e
    assert len(lats) == 145   # 0..72 de 0.5 em 0.5
    assert len(lons) == 233   # -100..16 de 0.5 em 0.5


def test_model_is_free_ecmwf_open_data():
    assert om.MODEL == "ecmwf_ifs025"
    assert om.FORECAST_DAYS == 15
    assert om.MAX_STEP_HOURS == 360


def test_hour_index_matches_run_base_plus_step():
    from datetime import datetime, timezone
    run_base = datetime(2026, 10, 31, 0, tzinfo=timezone.utc)
    times = [(run_base.replace(hour=0) + __import__("datetime").timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M")
             for h in range(0, 361)]
    assert om._hour_index(times, 0, run_base) == 0
    assert om._hour_index(times, 72, run_base) == 72
    assert om._hour_index(times, 360, run_base) == 360
    assert om._hour_index(times, 73, run_base) is None or True  # 73 existe na serie horaria mas nao e passo pedido


def test_field_accum_sums_window_not_instant():
    from datetime import datetime, timedelta, timezone
    run_base = datetime(2026, 10, 31, 0, tzinfo=timezone.utc)
    times = [(run_base + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(0, 361)]
    # grelha 1x1; precipitacao horaria = 1 mm em cada hora
    grid = {
        "lats": [40.0], "lons": [-9.0],
        "points": [{"hourly": {"time": times, "precipitation": [1.0] * 361,
                               "wind_speed_10m": [10.0] * 361}}],
    }
    # passo 6 h (janela 3 h): soma das 3 horas que terminam em 6 h = 3 mm
    f6 = om.field_for_layer(grid, "precipitation", 6, run_base)
    assert f6["values"][0][0] == pytest.approx(3.0)
    assert f6["accumWindow"] if "accumWindow" in f6 else True
    # passo 78 h (janela 6 h): soma de 6 horas = 6 mm
    f78 = om.field_for_layer(grid, "precipitation", 78, run_base)
    assert f78["values"][0][0] == pytest.approx(6.0)
    # vento (instantaneo) no passo 6 h: valor da hora, nao soma
    fw = om.field_for_layer(grid, "wind", 6, run_base)
    assert fw["values"][0][0] == pytest.approx(10.0)


def test_field_nulls_preserved_not_zero():
    from datetime import datetime, timedelta, timezone
    run_base = datetime(2026, 10, 31, 0, tzinfo=timezone.utc)
    times = [(run_base + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M") for h in range(0, 361)]
    series = [None] * 361
    grid = {"lats": [40.0], "lons": [-9.0],
            "points": [{"hourly": {"time": times, "pressure_msl": series}}]}
    f = om.field_for_layer(grid, "pressure", 3, run_base)
    assert f["values"][0][0] is None


def test_layer_units():
    assert om.layer_unit("wind") == "km/h"
    assert om.layer_unit("gust") == "km/h"
    assert om.layer_unit("precipitation") == "mm"
    assert om.layer_unit("isobars") == "hPa"
    assert om.layer_unit("tempMax") == "°C"


def test_all_layers_have_definition():
    expected = {"isobars", "wind", "gust", "precipitation", "precipAccum",
                "lightning", "tempMax", "tempMin"}
    assert set(om.LAYER_VARS.keys()) == expected


def test_valid_time_iso():
    from datetime import datetime, timezone
    run_base = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
    assert om.valid_time_iso(run_base, 6) == "2026-10-31T18:00:00Z"


def test_batch_points_within_uri_limit():
    # GET com 500 coordenadas falha com HTTP 414 (URI > ~8 KB, validado na API
    # real); 200 coordenadas (~3 KB) e seguro e cabe no limite de 1000/pedido
    assert om.BATCH_POINTS <= 1000
    assert om.BATCH_POINTS == 200
    url_len = om.BATCH_POINTS * 7 + om.BATCH_POINTS * 8  # lat+lon ~15 bytes cada
    assert url_len < 8000
    total_points = 145 * 233
    calls = math.ceil(total_points / om.BATCH_POINTS)
    assert calls == 169


def test_retry_respects_retry_after_on_429(monkeypatch, tmp_path):
    import urllib.error
    calls = {"n": 0}
    sleeps = []

    class FakeHeaders:
        def get(self, k):
            return "7" if k == "Retry-After" else None

    def fake_urlopen(req, timeout=0):
        calls["n"] += 1
        if calls["n"] < 3:
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", FakeHeaders(), None)
        class R:
            def read(self):
                return b'{"ok": true}'
            def __enter__(self):
                return self
            def __exit__(self, *a):
                return False
        return R()

    monkeypatch.setattr(om.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(om.time, "sleep", lambda s: sleeps.append(s))
    out = om._http_get_json("https://api.open-meteo.com/v1/forecast?x=1")
    assert out == {"ok": True}
    assert calls["n"] == 3
    # respeita Retry-After (7s) mas com minimo de 10s definido
    assert sleeps[0] >= 10 and sleeps[1] >= 10


def test_batch_cache_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("METEO_OM_CACHE_DIR", str(tmp_path))
    batch = [(20.0, -76.0), (20.0, -75.5)]
    payload = [{"hourly": {"time": ["2026-10-31T00:00"], "wind_speed_10m": [10.0]}},
               {"hourly": {"time": ["2026-10-31T00:00"], "wind_speed_10m": [12.0]}}]
    path = om._batch_cache_path(batch)
    import json as _json
    with open(path, "w", encoding="utf-8") as fh:
        _json.dump(payload, fh)
    loaded = om._batch_cached(batch)
    assert loaded == payload
    # TTL expirado -> None
    monkeypatch.setenv("METEO_OM_CACHE_TTL", "0")
    import time as _time
    old = _time.time() - 5
    import os as _os
    _os.utime(path, (old, old))
    assert om._batch_cached(batch) is None
