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

## Redirects

Old URLs that must not 404 (they are still linked from elsewhere, e.g. the
READMEs in `roc-lang/examples`, and anything pointing at the old
`/builtins/<Module>` docs) are redirected via `website/public/_redirects`, which
Cloudflare applies to both `roc-lang.org` and `www.roc-lang.org`. Add one rule
per line as `/old-path /new-path 301`; `/old/* /new/:splat 301` redirects a whole
subtree, and `/old/:name /new/:name 301` redirects a single path segment.

Cloudflare matches the exact ("static") rules first, wherever they sit in the
file, and only then the ones with a splat or a placeholder ("dynamic") -- and
between two dynamic rules that both match, file order is *not* honored: a
catch-all `/builtins/*` won over an earlier `/builtins/main/*`, sending
`/builtins/main/Str` to a nonexistent `/docs/main/main/Str`. So dynamic rules
must not overlap each other; carve out exceptions with static rules instead
(spelling out both the slashed and unslashed form, since Cloudflare has no
trailing-slash fallback).

Nothing on the site links to these old URLs, so the link checker can't reach
them. `ci_scripts/check-redirects.sh` checks them instead — it runs daily and on
every preview deployment, and fails if a rule in `_redirects` has no test case,
so add one there alongside any new rule:

```sh
./ci_scripts/check-redirects.sh                             # production
./ci_scripts/check-redirects.sh --base-url http://localhost:8080
```

These rules used to be written by `write_builtins_redirects!` in
`build_website.roc`; they are a checked-in file now because nothing in them is
derived from the build any more.

`serve.py` applies `_redirects` too, so a local preview behaves like production.
