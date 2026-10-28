# Local semantic highlighting workbench

The website executes only JavaScript. This optional local tool compares its actual
`rocSemanticTokens` output with the Roc compiler, composes typed source fragments,
and saves reproducible differences. It neither executes generated Roc programs nor
runs as part of website builds or CI.

Use Node.js 24 and Zig 0.17.0 (the compiler's pinned generation). From the repository root:

```sh
node website/tools/highlight-fuzz/harness.mjs prepare
node --test website/tools/highlight-fuzz/harness.test.mjs
node --test website/tools/highlight-fuzz/native.test.mjs
node website/tools/highlight-fuzz/harness.mjs compare sample.roc
node website/tools/highlight-fuzz/harness.mjs fuzz --seed 1 --iterations 10000
node website/tools/highlight-fuzz/harness.mjs replay website/.cache/highlight-fuzz/finding-1.json
node website/tools/highlight-fuzz/harness.mjs minimize website/.cache/highlight-fuzz/finding-1.json
node website/tools/highlight-fuzz/harness.mjs metadata-refresh --timeout 30000
```

`prepare` downloads a content-addressed compiler source dependency and its build
dependencies. The native driver uses safe optimization (ReleaseSafe in earlier Zig
terminology). Initial compilation can take several minutes. To investigate throughput
separately, run `node website/tools/highlight-fuzz/harness.mjs prepare --optimize fast`;
the ignored build manifest records that mode with every finding. The checked-in metadata snapshot is generated explicitly,
so neither Zig nor network access is required for ordinary highlighting tests.

`fuzz` also accepts `--corpus DIR`, `--out DIR`, and `--timeout MILLISECONDS` (default 2000).
All commands accept `--prefix DIR` to select a separate build prefix relative to this
directory. For example, `prepare --optimize debug --prefix .cache/debug` keeps a Debug
driver beside the default safe build; pass the same prefix to subsequent commands. Use a distinct
output directory for each campaign. It retains inputs introducing new construct,
lexical-transition, or semantic-role features and mutates those retained inputs. Both
whole programs and deliberately damaged variants are generated. Findings are grouped
by disagreement category and expected/actual role; the smallest representative seen
is retained. The explicit `minimize` command performs delta debugging while preserving
that signature and whether the reference was checked or parse-based. The `.min.json`
file retains the original provenance alongside the reduced source and fresh outputs.

## Reference contract and comparison

`main.zig` accepts one JSON object per line:

```json
{"id":1,"source":"module [result]\nresult = 1\n","check":true}
```

Responses echo `id` and contain `lexical`, `semantic`, `diagnostics`, and `confidence`.
All returned spans are half-open UTF-8 byte offsets. Lexical entries preserve the
compiler's raw `tag` and `highlightCategory`. Semantic entries preserve the compiler's
LSP type name and modifier bitmask. The comparator converts production UTF-16 spans
into byte offsets and splits intervals at both outputs' boundaries.

`checked` means a checked module environment was available without blocking reports.
Otherwise semantic output uses the compiler's parse-based extractor and is explicitly
labeled `parse`. No reference fallback is silently claimed to be checked. The private
`builtin` request flag selects the compiler's embedded, prechecked builtin environment;
it requires source identity with that environment and is used only by metadata refresh.

Differences on checked source are semantic when they refine the same identifier
family and lexical otherwise. Differences on parse-based output are recovery findings.
The LSP intentionally omits punctuation and comments, so comparison is restricted to
reference-covered intervals. Numeric and keyword lexer spans additionally check direct
coverage. Other raw lexer tags remain available in reports but do not independently
assert semantic classifications. Zero findings therefore does not imply identical
lexer streams or full compiler parity. Compiler output can itself be wrong: inspect
both the minimized source and the reference's diagnostics before changing production.

Metadata refresh uses checked builtin semantic roles, then projects annotation return
syntax into function/value shapes. The snapshot records that distinction's compiler
revision and confidence. It contains the published annotation surface rather than a
full type checker, runtime values, or arbitrary dependency exports.

## Regression policy

Run the fast production suite with:

```sh
node --test ci_scripts/roc_syntax.test.mjs ci_scripts/roc_highlight_dom.test.mjs
```

For a useful finding, reduce it and add one focused assertion to the production suite.
Consolidate cases exercising the same rule. Generated corpora, compiler caches, reports,
and executables stay ignored; do not commit entire fuzz campaigns or broad snapshots.
When changing the compiler reference, update the URL and hash together with `zig fetch
--save-exact=roc URL`, refresh metadata intentionally, and rerun focused regressions.
