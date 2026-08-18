#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import os


def load_redirects(directory):
    """Read the "_redirects" file Cloudflare uses, as an ordered rule list.

    Each rule is (source, target, status); a source ending in "*" is a wildcard
    whose matched suffix replaces ":splat" in the target. Rules are kept in file
    order because, as on Cloudflare, the first match wins. Without this, paths
    that redirect in production (e.g. /tutorial) 404 here, so a local
    `check-links.sh --local` run reports failures that aren't real.
    """
    rules = []
    try:
        with open(os.path.join(directory, "_redirects"), encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return rules
    for line in lines:
        # Only whole-line comments, like Cloudflare: a "#" mid-line starts the
        # fragment of a destination such as /docs/main/Str/#inspect.
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        source, target = parts[0], parts[1]
        status = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 302
        rules.append((source, target, status))
    return rules


def match_redirect(rules, path):
    """Resolve `path` against the rules, returning (target, status) or None."""
    # Trailing slashes are insignificant when matching, so /builtins and
    # /builtins/ hit the same rule.
    normalized = path.rstrip("/") or "/"
    for source, target, status in rules:
        if source.endswith("*"):
            prefix = source[:-1]
            if path.startswith(prefix):
                return target.replace(":splat", path[len(prefix):]), status
        elif (source.rstrip("/") or "/") == normalized:
            return target, status
    return None


class Handler(SimpleHTTPRequestHandler):
    redirects = []

    def send_head(self):
        path = self.path.split("?", 1)[0]
        rule = match_redirect(self.redirects, path)
        if rule is not None:
            target, status = rule
            self.send_response(status)
            self.send_header("Location", target)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return None
        return super().send_head()

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

    Handler.redirects = load_redirects(args.directory)

    def handler(*handler_args, **handler_kwargs):
        return Handler(*handler_args, directory=args.directory, **handler_kwargs)

    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"Serving {args.directory} at http://{args.bind}:{args.port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
