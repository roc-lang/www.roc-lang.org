# Roc website

Contains everything needed to build [www.roc-lang.org](https://www.roc-lang.org/).

The build uses the new Zig-based Roc compiler pinned in `.roc-version` and the
basic-ssg platform.

Build with:

```sh
cd website
roc build build_website.roc
./build_website --roc="$(command -v roc)"
```

Omit `--roc` to let the build download the compiler pinned by `.roc-version`
and its matching source. Use `--roc-src=/path/to/roc` if a local compiler is not
inside its source checkout. Additional options are:

```sh
./build_website --cache   # reuse downloaded/generated dependencies
./build_website --minify  # production asset minification; requires minify on PATH
```

Preview the result with:

```sh
python3 serve.py build 8080
```
