# Roc website

Contains everything needed to build [www.roc-lang.org](https://www.roc-lang.org/).

The build uses the new Zig-based Roc compiler pinned in `website/build_website.roc`
and the basic-ssg platform. It also downloads the `roc-lang/examples` commit
configured in `website/examples.json`; the dependency must declare a matching
`.roc-version`.

The build requires `bash`, `curl`, `python3`, `tar`, `unzip`, and standard Unix
file tools.

Build with:

```sh
cd website
roc build build_website.roc
./build_website --roc="$(command -v roc)"
```

Omit `--roc` to let the build download the compiler pinned in `build_website.roc`
and its matching source. Use `--roc-src=/path/to/roc` if a local compiler is not
inside its source checkout. Additional options are:

```sh
./build_website --cache   # reuse downloaded/generated dependencies
./build_website --minify  # production asset minification; requires minify on PATH
./build_website --examples-only # fetch, validate, and render examples only
```

Every build compiles or tests the examples listed in `website/examples.json`.
The manifest pins the repository and revision and describes each published
example like this:

```json
{
  "directory": "FizzBuzz",
  "title": "FizzBuzz",
  "validation": ["build:main.roc", "test:main.roc"]
}
```

To update the dependency, select a commit already on `roc-lang/examples/main`,
update the `revision` and examples in `website/examples.json`, and rebuild. The
build stops before rendering if the dependency and website Roc pins differ.

Preview the result with:

```sh
python3 serve.py build 8080
```
