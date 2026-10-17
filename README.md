# Roc website

Contains everything needed to build [www.roc-lang.org](https://www.roc-lang.org/).

The build uses the new Zig-based Roc compiler pinned in `website/build_website.roc`
and the basic-ssg platform. It also downloads the `roc-lang/examples` commit
configured in `website/examples.json`. Each example with validation actions pins
its own Roc nightly in its `app` header (`roc: "nightly-..."`) and is validated with that
version; the website's compiler is used when the pins match, otherwise the
pinned nightly is downloaded.

The build requires Node.js 24 (see `.node-version`), `bash`, `curl`, `python3`,
`tar`, `unzip`, and standard Unix file tools.

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

Every build runs the validation actions for the enabled examples in `website/examples.json`.
The manifest pins the repository and revision and describes each published
example like this:

```json
{
  "directory": "FizzBuzz",
  "title": "FizzBuzz",
  "category": "getting-started",
  "description": "Use conditions and arithmetic to solve the classic FizzBuzz exercise.",
  "validation": ["build:main.roc", "test:main.roc"]
}
```

Validation actions support `build`, `build-dev`, `test`, and `check`.
Use an empty `validation` list for prose-only examples or examples awaiting
migration; these are labeled "not validated" on the examples index and do not
require a compiler pin. Include "awaiting migration" in the title when the code
is not yet compatible.

Examples are enabled by default. Set `"enabled": false` to keep an entry's metadata
while excluding it from the index, generated pages, and validation runs. Categories
and subcategories with no enabled examples are also omitted. Unlike an empty
`validation` list, this prevents the example from being published at all.

`HelloWeb`, `ElmWebApp`, and `SortStrings` are disabled until the examples repository
has proper test runs for them. Once those tests are in place, update the pinned
revision and validation actions as needed, then remove `"enabled": false` or set it
to `true`.

The manifest's `categories` list defines the section order and stable anchor IDs:

```json
{ "id": "getting-started", "title": "Getting started" }
```

Each example belongs to one category and has a short description of what it
teaches. Categories with no examples are omitted from the page and its navigation.
Examples retain their manifest order within each category; place simpler examples
first, before those that build on their concepts. An optional
`subcategory` groups related entries under a subheading, such as `basic-cli` in
Platforms; subcategories appear in the order they are first used, after any
ungrouped entries. Existing example URLs do not depend on these categories.

`website/examples.py` validates the manifest and generates the categorized index.
`website/prepare_examples.sh` copies every enabled example and runs its configured validation
actions, regardless of its category. Check the manifest and index logic locally with:

```sh
python3 -m unittest discover -s ci_scripts -p 'test_examples.py'
```

To update the dependency, select a commit already on `roc-lang/examples/main`,
update the `revision` and examples in `website/examples.json`, and rebuild. Examples that pin a
different nightly than the website are marked as such on the examples index.

Preview the result with:

```sh
python3 serve.py build 8080
```

## Browser compiler updates

`website/compiler-wasm.json` pins the homepage's browser compiler and checksum.
The daily update PR advances it alongside the native compiler once the nightly
includes `echo.wasm.zst`. Builds verify and optimize the download; CI tests the
resulting Wasm. Until that artifact is published, `release: null` keeps using the
checked-in compiler with checksum verification.

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
