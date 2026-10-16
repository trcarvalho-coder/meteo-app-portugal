"""Pre-computacao dos campos ECMWF para publicacao estatica (GitHub Pages).

Gera JSON por (variavel, passo) em data/forecast/<run>/, prontos a serem
servidos pelo GitHub Pages e lidos diretamente pelo frontend (sem backend
em runtime). Executado por workflow agendada do GitHub Actions.

Variaveis: temperature, windSpeed, precipitation.
Precipitacao usa incrementos por diferenca de acumulados (passos nativos).

Regras de publicacao:
- Escreve numa pasta temporaria; valida; so depois move para data/forecast/<run>/.
- O indice (latest.json / index.json) lista APENAS os passos efetivamente
  escritos para TODAS as variaveis (`availableSteps`), alem de `run`,
  `generatedAt` e `maxStep`.
- Se faltar algum passo <= MAX_STEP_HOURS, termina com codigo de erro e NAO
  atualiza latest.json (mantem a execucao anterior completa).
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import ecmwf_adapter as a  # noqa: E402

OUT_DIR = os.environ.get("METEO_DATA_OUT", os.path.join(os.path.dirname(__file__), "..", "data", "forecast"))
VARIABLES = ("temperature", "windSpeed", "precipitation")


def write_index(run: dict, available_steps: list[int]) -> dict:
    index = {
        "run": f"{run['date']}/{run['hour']}",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "maxStep": max(available_steps) if available_steps else 0,
        "nativeSteps": available_steps,
        "availableSteps": available_steps,
    }
    return index


def main() -> int:
    run = a.select_run()
    if not run:
        print("ERRO: nenhuma execucao completa disponivel no bucket", file=sys.stderr)
        return 1
    run_id = f"{run['date']}{run['hour']}"
    out_dir = os.path.join(OUT_DIR, run_id)
    tmp_dir = out_dir + ".tmp"
    shutil.rmtree(tmp_dir, ignore_errors=True)
    os.makedirs(tmp_dir, exist_ok=True)
    print(f"Execucao: {run['date']}/{run['hour']} -> {tmp_dir}")

    steps = a.native_steps()
    failed: list[str] = []
    for step in steps:
        for variable in ("temperature", "windSpeed"):
            path = os.path.join(tmp_dir, f"{variable}-{step}h.json")
            field = a.field_json(run, variable, step)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(field, fh, separators=(",", ":"))
            print(f"  ok {variable}-{step}h")
        # precipitacao: incremento por diferenca (apenas passos nativos)
        path = os.path.join(tmp_dir, f"precipitation-{step}h.json")
        inc = a.precipitation_increment(run, step)
        if inc is None:
            failed.append(f"precipitation-{step}h")
            continue
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(inc, fh, separators=(",", ":"))
        print(f"  ok precipitation-{step}h")

    # validar: todos os passos <= horizonte escritos para TODAS as variaveis
    available_steps = [
        step for step in steps
        if all(os.path.exists(os.path.join(tmp_dir, f"{v}-{step}h.json")) for v in VARIABLES)
    ]
    missing = [s for s in steps if s not in available_steps]
    if failed or missing:
        print(f"ERRO: execucao incompleta; passos em falta: {missing} {failed}", file=sys.stderr)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        return 1  # latest.json anterior mantido intacto

    # escrita atomica: pasta temporaria validada -> destino final
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.replace(tmp_dir, out_dir)

    index = write_index(run, available_steps)
    latest_path = os.path.join(OUT_DIR, "latest.json")
    tmp_latest = latest_path + ".tmp"
    with open(tmp_latest, "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    os.replace(tmp_latest, latest_path)
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    print(f"Indice atualizado: {latest_path} ({len(available_steps)} passos, maxStep {index['maxStep']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
