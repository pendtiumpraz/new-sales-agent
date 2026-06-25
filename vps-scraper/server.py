#!/usr/bin/env python3
"""
VPS Scraper REST API v2 — Multi-platform scraper backend.
POST /scrape → { platform, url/query/username, count, timeout }
GET  /health → Status + platform list
GET  /platforms → Detail parameter tiap platform
"""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

from scraper import PLATFORMS, scrape

PORT = int(os.environ.get("VPS_SCRAPER_PORT", "8765"))
AUTH_TOKEN = os.environ.get("VPS_SCRAPER_TOKEN", "")

AVAILABLE = list(PLATFORMS.keys())

HELP = {
    "website": {"url": "URL perusahaan (https://gramedia.com)"},
    "google": {"query": "Kata kunci pencarian", "count?": "Jumlah hasil (default 10)"},
    "linkedin": {"url": "URL profil/perusahaan LinkedIn"},
    "instagram": {"username": "Username (bisa pake @)"},
    "facebook": {"url": "URL halaman Facebook"},
    "tiktok": {"username": "Username TikTok (bisa pake @)"},
    "shopee": {"query": "Kata kunci produk", "count?": "Jumlah hasil (default 10)"},
}


class ScraperHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._json(200, {
                "status": "ok",
                "service": "vps-scraper",
                "version": "2.0",
                "port": PORT,
                "platforms": AVAILABLE,
                "auth": bool(AUTH_TOKEN),
            })
        elif self.path == "/platforms":
            self._json(200, {"platforms": HELP})
        else:
            self._json(404, {"error": "Gunakan GET /health, GET /platforms, atau POST /scrape"})

    def do_POST(self):
        if self.path == "/scrape":
            self._handle_scrape()
        else:
            self._json(404, {"error": "Endpoint gak dikenal"})

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _handle_scrape(self):
        # Auth
        token = self.headers.get("X-VPS-Scraper-Token", "")
        if AUTH_TOKEN and token != AUTH_TOKEN:
            self._json(401, {"error": "Unauthorized"})
            return

        # Baca body
        try:
            cl = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(cl).decode())
        except Exception:
            self._json(400, {"error": "Invalid JSON body"})
            return

        platform = body.get("platform", "website")
        timeout = body.get("timeout", 15)
        count = body.get("count", 10)

        if platform not in PLATFORMS:
            self._json(400, {"error": f"Platform '{platform}' gak dikenal", "available": AVAILABLE})
            return

        # Build params per platform
        params = {"timeout": timeout}

        if platform in ("website", "linkedin", "facebook"):
            url = body.get("url", "")
            if not url:
                self._json(400, {"error": f"'{platform}' butuh 'url'", "help": HELP[platform]})
                return
            params["url"] = url

        elif platform in ("google", "shopee"):
            query = body.get("query", "")
            if not query:
                self._json(400, {"error": f"'{platform}' butuh 'query'", "help": HELP[platform]})
                return
            params["query"] = query
            params["count"] = count

        elif platform in ("instagram", "tiktok"):
            username = body.get("username", body.get("url", ""))
            if not username:
                self._json(400, {"error": f"'{platform}' butuh 'username'", "help": HELP[platform]})
                return
            params["username"] = username

        result = scrape(platform, **params)
        self._json(200, result)

    def _json(self, status: int, data: dict):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-VPS-Scraper-Token")

    def log_message(self, fmt, *args):
        print(f"[VPS-Scraper] {args[0]} {args[1]} {args[2]}")


def main():
    print(f"🚀 VPS Scraper API v2 — Multi-Platform")
    print(f"   Port: {PORT}")
    print(f"   Platforms: {', '.join(AVAILABLE)}")
    print(f"   Auth: {'✅ Active' if AUTH_TOKEN else '⚠️  DISABLED'}")
    print()
    print(f"   POST /scrape  → body: {{ platform, url/query/username, count, timeout }}")
    print(f"   GET  /health  → status + platform list")
    print(f"   GET  /platforms → detail tiap platform")
    print()

    server = HTTPServer(("0.0.0.0", PORT), ScraperHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
        server.server_close()


if __name__ == "__main__":
    main()
