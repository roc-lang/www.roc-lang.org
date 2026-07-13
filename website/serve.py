#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import os


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        fs_path = super().translate_path(path)
        # Mirror Cloudflare Pages "clean URLs": an extensionless request like
        # /fast is served from fast.html. SimpleHTTPRequestHandler only serves
        # exact paths, so without this every extensionless content link 404s
        # locally even though it works in production.
        if not os.path.isdir(fs_path) and not os.path.exists(fs_path):
            _root, ext = os.path.splitext(fs_path)
            if not ext and os.path.isfile(fs_path + ".html"):
                return fs_path + ".html"
        return fs_path

    def guess_type(self, path):
        if path.endswith(".wasm.br"):
            return "application/wasm"
        return super().guess_type(path)

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        self.send_header("Cache-Control", "no-store")
        if path.endswith(".wasm.br"):
            self.send_header("Content-Encoding", "br")
            self.send_header("Vary", "Accept-Encoding")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default="build")
    parser.add_argument("port", nargs="?", type=int, default=8080)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args()

    def handler(*handler_args, **handler_kwargs):
        return Handler(*handler_args, directory=args.directory, **handler_kwargs)

    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"Serving {args.directory} at http://{args.bind}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
