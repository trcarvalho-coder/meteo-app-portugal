"""Pre-computacao das camadas Open-Meteo (modelo ECMWF ecmwf_ifs025) para
publicacao estatica em data/om/ (GitHub Pages).

Executado 2x por dia por workflow agendada (ver .github/workflows/precompute-om.yml):
apos cada nova execucao 00z/06z/12z/18z do modelo ECMWF publicada pela Open-Meteo.

Regras de publicacao (iguais as do pipeline ECMWF AWS):
- escreve numa pasta temporaria, valida, e so depois move para data/om/<run>/;
- latest.json lista APENAS os passos/camadas efetivamente escritos;
- se faltar algum campo, termina com erro e NAO atualiza latest.json.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

import openmeteo_grid as om  # noqa: E402

OUT_DIR = os.environ.get("METEO_OM_OUT", os.path.join(os.path.dirname(__file__), "..", "data", "om"))


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        index = om.write_run(OUT_DIR)
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: pre-computacao Open-Meteo falhou: {exc}", file=sys.stderr)
        return 1

    run_id = index["run"].replace("/", "")
    latest_path = os.path.join(OUT_DIR, "latest.json")
    tmp_latest = latest_path + ".tmp"
    with open(tmp_latest, "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    os.replace(tmp_latest, latest_path)
    print(f"OK: data/om/{run_id} — {len(index['steps'])} passos x {len(index['layers'])} camadas (maxStep {index['maxStep']} h)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
