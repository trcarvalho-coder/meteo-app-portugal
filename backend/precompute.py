"""Pre-computacao dos campos ECMWF para publicacao estatica (GitHub Pages).

Gera JSON por (variavel, passo) em data/forecast/<run>/, prontos a serem
servidos pelo GitHub Pages e lidos diretamente pelo frontend (sem backend
em runtime). Executado por workflow agendada do GitHub Actions.

Variaveis: temperature, windSpeed, precipitation.
Precipitacao usa incrementos por diferenca de acumulados (passos nativos).
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import ecmwf_adapter as a  # noqa: E402

OUT_DIR = os.environ.get("METEO_DATA_OUT", os.path.join(os.path.dirname(__file__), "..", "data", "forecast"))


def main() -> int:
    run = a.select_run()
    if not run:
        print("ERRO: nenhuma execucao completa disponivel no bucket", file=sys.stderr)
        return 1
    run_id = f"{run['date']}{run['hour']}"
    out_dir = os.path.join(OUT_DIR, run_id)
    os.makedirs(out_dir, exist_ok=True)
    print(f"Execucao: {run['date']}/{run['hour']} -> {out_dir}")

    steps = a.native_steps()
    for step in steps:
        for variable in ("temperature", "windSpeed"):
            path = os.path.join(out_dir, f"{variable}-{step}h.json")
            if os.path.exists(path):
                print(f"  [cache] {variable}-{step}h")
                continue
            field = a.field_json(run, variable, step)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(field, fh, separators=(",", ":"))
            print(f"  ok {variable}-{step}h")
        # precipitacao: incremento por diferenca (apenas passos nativos)
        path = os.path.join(out_dir, f"precipitation-{step}h.json")
        if os.path.exists(path):
            print(f"  [cache] precipitation-{step}h")
            continue
        inc = a.precipitation_increment(run, step)
        if inc is None:
            continue
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(inc, fh, separators=(",", ":"))
        print(f"  ok precipitation-{step}h")

    # indice da execucao: passos nativos e cobertura
    index = {"run": f"{run['date']}/{run['hour']}", "nativeSteps": steps}
    with open(os.path.join(OUT_DIR, "latest.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    print("Indice atualizado: data/forecast/latest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
