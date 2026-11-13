"""Loopback-only, bounded dynamics endpoint. No file input or code execution API."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from urllib.parse import urlsplit

from simulation import compare, load_model, profile

MODEL = load_model()
ALLOWED_PORTS = {4173, 5173}


def allowed_origin(origin: str | None) -> bool:
    if origin is None:
        return True
    try:
        parsed = urlsplit(origin)
        return (
            parsed.scheme == 'http'
            and parsed.hostname in {'127.0.0.1', 'localhost'}
            and parsed.port in ALLOWED_PORTS
            and not parsed.username
            and not parsed.password
            and parsed.path in {'', '/'}
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = 'RobotRadarDynamics/1.0'

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        origin = self.headers.get('Origin')
        if origin and allowed_origin(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(body)

    def check_request(self) -> bool:
        if self.headers.get('Host') not in {'127.0.0.1:8765', 'localhost:8765'}:
            self.send_json(403, {'error': 'Unsupported host.'})
            return False
        if not allowed_origin(self.headers.get('Origin')):
            self.send_json(403, {'error': 'Only the local robot learning app may call this endpoint.'})
            return False
        return True

    def do_GET(self) -> None:
        if not self.check_request():
            return
        if self.path == '/health':
            self.send_json(200, {'status': 'ready', 'engine': 'MuJoCo', 'configuration': 'g1_23dof_mode_10'})
        elif self.path == '/profile':
            self.send_json(200, profile(MODEL))
        else:
            self.send_json(404, {'error': 'Not found.'})

    def do_OPTIONS(self) -> None:
        if not self.check_request():
            return
        self.send_response(204)
        origin = self.headers.get('Origin')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_POST(self) -> None:
        if not self.check_request():
            return
        if self.path != '/simulate':
            self.send_json(404, {'error': 'Not found.'})
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            self.send_json(415, {'error': 'Content-Type must be application/json.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 1 <= length <= 4096:
            self.send_json(413, {'error': 'Request body must be 1–4096 bytes.'})
            return
        try:
            request = json.loads(self.rfile.read(length))
            result = compare(MODEL, request)
        except (ValueError, TypeError, UnicodeError) as error:
            self.send_json(400, {'error': str(error)})
            return
        except RuntimeError as error:
            self.send_json(422, {'error': str(error)})
            return
        self.send_json(200, result)

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(5)


if __name__ == '__main__':
    print('G1 Mode 10 fixed-base dynamics at http://127.0.0.1:8765', flush=True)
    # Deliberately single-threaded: model execution is bounded and requests cannot race.
    HTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
