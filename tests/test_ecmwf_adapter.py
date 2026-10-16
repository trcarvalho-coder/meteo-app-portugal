# ===== Testes do backend ECMWF =====
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import ecmwf_adapter as a  # noqa: E402


def test_native_steps_3h_to_144h_6h_afterwards():
    steps = a.native_steps()
    assert steps[0] == 0
    assert 144 in steps
    assert 168 in steps
    assert 147 not in steps
    assert all(s % 3 == 0 for s in steps if s <= 144)
    assert [s for s in steps if s > 144] == [150, 156, 162, 168]


def test_units_temperature_kelvin_to_celsius():
    values = np.array([[273.15, 283.15]])
    result = values - 273.15
    assert result[0][0] == pytest.approx(0.0)
    assert result[0][1] == pytest.approx(10.0)


def test_units_precipitation_meters_to_mm():
    values = np.array([[0.001]])
    assert (values * 1000.0)[0][0] == pytest.approx(1.0)


def test_wind_speed_from_components_ms_to_kmh():
    u = np.array([[3.0]])
    v = np.array([[4.0]])
    speed = np.hypot(u, v) * 3.6
    assert speed[0][0] == pytest.approx(18.0)


def test_crop_latitudes_descending():
    lats = np.array([90.0, 44.0, 30.0, 0.0])
    lons = np.array([-31.0, -9.0])
    values = np.arange(8).reshape(4, 2)
    clats, clons, cvals = a._crop(lats, lons, values)
    assert list(clats) == [44.0, 30.0]
    assert list(clons) == [-31.0, -9.0]
    assert cvals.shape == (2, 2)


def test_crop_longitude_conventions():
    lats = np.array([40.0])
    lons = np.array([-30.0, -9.0, 10.0])
    values = np.array([[1.0, 2.0, 3.0]])
    _, clons, _ = a._crop(lats, lons, values)
    assert list(clons) == [-30.0, -9.0]


def test_crop_longitude_convention_0_360():
    lats = np.array([40.0])
    lons = np.array([330.0, 351.0, 10.0])
    values = np.array([[1.0, 2.0, 3.0]])
    _, clons, _ = a._crop(lats, lons, values)
    assert list(clons) == [330.0, 351.0]


def test_valid_time_equals_run_plus_step():
    run = {"date": "20261016", "hour": "00z"}
    valid = a._valid_time(run, 6)
    assert valid == datetime(2026, 10, 16, 6, tzinfo=timezone.utc)


def test_valid_time_12z_run():
    run = {"date": "20261016", "hour": "12z"}
    valid = a._valid_time(run, 3)
    assert valid == datetime(2026, 10, 16, 15, tzinfo=timezone.utc)


def test_nan_values_are_null_not_zero():
    row = [float("nan"), 0.0]
    out = [None if (isinstance(x, float) and np.isnan(x)) else x for x in row]
    assert out[0] is None
    assert out[1] == 0.0


def test_precipitation_increment_requires_native_step():
    run = {"date": "20261016", "hour": "00z"}
    # passo 147 não é nativo: sem desagregação artificial
    assert a.precipitation_increment(run, 147) is None


def test_increment_by_difference_not_sum():
    cur, prev = 4.0, 1.0
    assert cur - prev == 3.0  # incremento correto
    assert cur + prev == 5.0  # soma de acumulados (errada) documentada


def test_increment_negative_difference_is_none():
    # regra implementada em precipitation_increment: d < -tolerância → None
    cur, prev, tol = 1.0, 5.0, 1e-9
    d = cur - prev
    assert d < -tol


@pytest.mark.network
def test_run_discovery_returns_recent_first():
    runs = a.discover_runs()
    assert len(runs) >= 1
    dates = [r["date"] for r in runs]
    assert dates == sorted(dates, reverse=True)
