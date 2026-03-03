#!/usr/bin/env python3
"""
Local dev proxy for the cycling app.
- Serves static files from this directory at http://localhost:8080/
- Proxies http://localhost:8080/icu-internal/... → https://intervals.icu/api/...
- Proxies http://localhost:8080/strava-internal/... → https://www.strava.com/api/v3/...
- Proxies http://localhost:8080/strava-auth/... → https://www.strava.com/oauth/...
  adding CORS headers so the browser can read the response.

Usage:  python proxy.py
Then open:  http://localhost:8080
"""

import http.server
import urllib.request
import urllib.parse
import os, sys

PORT = 8080

PROXY_PREFIX     = '/icu-internal/'
TARGET_BASE      = 'https://intervals.icu/api/'

STRAVA_API_PREFIX  = '/strava-internal/'
STRAVA_API_TARGET  = 'https://www.strava.com/api/v3/'

STRAVA_AUTH_PREFIX  = '/strava-auth/'
STRAVA_AUTH_TARGET  = 'https://www.strava.com/oauth/'


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy()
        elif self.path.startswith(STRAVA_API_PREFIX):
            self._strava_proxy()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith(STRAVA_AUTH_PREFIX):
            self._strava_auth()
        else:
            self.send_response(405)
            self._cors_headers()
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Accept, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    def _proxy(self):
        tail = self.path[len(PROXY_PREFIX):]
        target = TARGET_BASE + tail
        try:
            auth = self.headers.get('Authorization', '')
            req  = urllib.request.Request(target,
                     headers={'Authorization': auth, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
                ct   = resp.headers.get('Content-Type', 'application/json')
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', len(body))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._cors_headers()
            self.end_headers()
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.end_headers()
            print(f'Proxy error: {e}')

    def _strava_proxy(self):
        tail = self.path[len(STRAVA_API_PREFIX):]
        target = STRAVA_API_TARGET + tail
        try:
            auth = self.headers.get('Authorization', '')
            req  = urllib.request.Request(target,
                     headers={'Authorization': auth, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read()
                ct   = resp.headers.get('Content-Type', 'application/json')
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', len(body))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, 'read') else b''
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(body))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.end_headers()
            print(f'Strava proxy error: {e}')

    def _strava_auth(self):
        tail = self.path[len(STRAVA_AUTH_PREFIX):]
        target = STRAVA_AUTH_TARGET + tail
        try:
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len)
            req = urllib.request.Request(target, data=body, method='POST',
                    headers={'Content-Type': 'application/x-www-form-urlencoded',
                             'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_body = resp.read()
                ct = resp.headers.get('Content-Type', 'application/json')
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', len(resp_body))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(resp_body)
        except urllib.error.HTTPError as e:
            resp_body = e.read() if hasattr(e, 'read') else b''
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(resp_body))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(resp_body)
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.end_headers()
            print(f'Strava auth error: {e}')

    def log_message(self, fmt, *args):
        if (PROXY_PREFIX in self.path or STRAVA_API_PREFIX in self.path or
            STRAVA_AUTH_PREFIX in self.path or self.path in ('/', '/index.html')):
            super().log_message(fmt, *args)


os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(f'Serving app at  http://localhost:{PORT}/')
print(f'Proxying /icu-internal/*     → https://intervals.icu/api/*')
print(f'Proxying /strava-internal/*  → https://www.strava.com/api/v3/*')
print(f'Proxying /strava-auth/*      → https://www.strava.com/oauth/*')
print('Press Ctrl+C to stop.\n')
with http.server.HTTPServer(('', PORT), ProxyHandler) as httpd:
    httpd.serve_forever()
