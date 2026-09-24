#!/usr/bin/env python3
"""Serve the maintenance page on the public port.

Replaces the vite preview for helpotron.dpdns.org while the site is taken down.
Every path returns the banner (so a bookmarked deep link also sees it), and the
API surface answers 503 so a client gets a clear "offline" rather than a 404 that
looks like a broken deploy.

Deliberately dumb: stdlib only, no proxying, no app import. The point is that it
cannot fail in the same way the app did.
"""
import http.server, os, socketserver, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "index.html")
PORT = int(os.environ.get("MAINTENANCE_PORT", "5173"))


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "helpotron-maintenance"

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        # Never let a CDN or the browser hold the banner once the site returns.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Retry-After", "3600")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _handle(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/") or path in ("/health", "/healthz"):
            return self._send(503, '{"status":"maintenance",'
                                   '"message":"Helpotron is temporarily closed '
                                   'for a major update."}',
                              ctype="application/json; charset=utf-8")
        try:
            with open(PAGE, "rb") as fh:
                return self._send(200, fh.read())
        except OSError as exc:
            return self._send(500, f"maintenance page unreadable: {exc}",
                              ctype="text/plain; charset=utf-8")

    do_GET = _handle
    do_HEAD = _handle
    do_POST = _handle
    do_PUT = _handle
    do_DELETE = _handle
    do_PATCH = _handle

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"maintenance page on 127.0.0.1:{PORT} (Ctrl-C to stop)", flush=True)
        httpd.serve_forever()
