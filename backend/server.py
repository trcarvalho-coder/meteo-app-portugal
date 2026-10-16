"""Servidor HTTP do backend meteorológico (loopback apenas).

Endpoints:
- GET /api/run            -> execução selecionada
- GET /api/field?variable=&step=  -> campo normalizado (JSON)
- GET /api/precip-increment?step= -> incremento de precipitação
- GET /api/steps          -> passos nativos e cobertura real

Executar: python backend/server.py  (liga em 127.0.0.1:8787)
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, ".")

import ecmwf_adapter as adapter  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def _json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        parsed = urlparse(self.path)
        query = {k: v[0] for k, v in parse_qs(self.qs if hasattr(self, "qs") else parsed.query).items()}
        try:
            if parsed.path == "/api/run":
                run = adapter.select_run()
                if not run:
                    self._json({"error": "Nenhuma execução completa disponível"}, 503)
                    return
                self._json({"run": f"{run['date']}/{run['hour']}"})

            elif parsed.path == "/api/steps":
                self._json({"nativeSteps": adapter.native_steps()})

            elif parsed.path == "/api/field":
                variable = query.get("variable", "temperature")
                step = int(query.get("step", "0"))
                run = self._run()
                payload = adapter.field_json(run, variable, step)
                self._json(payload)

            elif parsed.path == "/api/precip-increment":
                step = int(query.get("step", "0"))
                run = self._run()
                payload = adapter.precipitation_increment(run, step)
                if payload is None:
                    self._json({"error": "Passo não nativo"}, 400)
                    return
                self._json(payload)

            else:
                self._json({"error": "Não encontrado"}, 404)
        except Exception as exc:  # noqa: BLE001
            self._json({"error": str(exc)}, 500)

    def _run(self):
        run = adapter.select_run()
        if not run:
            raise RuntimeError("Nenhuma execução completa disponível")
        return run

    def log_message(self, fmt, *args):  # logs úteis, sem dados sensíveis
        print(f"[backend] {self.address_string()} {fmt % args}")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 8787), Handler)
    print("Backend meteo em http://127.0.0.1:8787 (loopback)")
    server.serve_forever()


if __name__ == "__main__":
    main()
