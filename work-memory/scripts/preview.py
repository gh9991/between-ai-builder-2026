# Local preview server: like `python3 -m http.server`, but tells the browser to check every file again, so an
# edited page or module never comes back from the cache (modules imported without a ?v= query included).
import functools, http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=root)).serve_forever()
