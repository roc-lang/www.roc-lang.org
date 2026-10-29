# Local highlighting harness

Compare the production JavaScript highlighter with a pinned Roc compiler. This
local tool does not execute generated programs or run in website builds or CI.
Requires Node.js 24 and Zig 0.17.0. From the repository root:

```sh
node website/tools/highlight-fuzz/harness.mjs prepare
node --test website/tools/highlight-fuzz/harness.test.mjs website/tools/highlight-fuzz/native.test.mjs
node website/tools/highlight-fuzz/harness.mjs compare sample.roc
node website/tools/highlight-fuzz/harness.mjs fuzz --seed 1 --iterations 10000
node website/tools/highlight-fuzz/harness.mjs replay website/.cache/highlight-fuzz/finding-1.json
node website/tools/highlight-fuzz/harness.mjs minimize website/.cache/highlight-fuzz/finding-1.json
node website/tools/highlight-fuzz/harness.mjs metadata-refresh --timeout 30000
```

`prepare` downloads pinned compiler sources and dependencies, then builds the
reference driver. The default mode is safe; use `--optimize fast` for throughput
measurements or `--optimize debug` for debugging. `--prefix DIR` selects another
build prefix relative to this directory; pass it to subsequent commands too.

Fuzzing retains inputs with new syntax/role features and saves minimal
representatives of disagreement categories. It accepts `--corpus DIR`, `--out DIR`,
and `--timeout MILLISECONDS` (default 2000). Use separate output directories for
independent campaigns. Seeds replay deterministically; minimization preserves
the disagreement signature and reference confidence.

`checked` means the reference checked the module without blocking reports.
Otherwise its semantic output is parse-based and differences are recovery
findings. Comparison converts JavaScript UTF-16 offsets to compiler UTF-8 bytes
and aligns overlapping spans. The compiler omits some punctuation and comments;
zero differences do not establish full lexer or semantic equivalence. Inspect
source and diagnostics before treating a compiler disagreement as a website bug.

For useful findings, add a small focused regression in `ci_scripts/roc_*.test.mjs`.
Keep corpora, reports, compiler caches, and executables ignored. Malformed input
can differ from compiler recovery; avoid broad snapshots and allowlists.

Metadata refresh regenerates the checked-in builtin export snapshot. Its compact
encoding preserves the full catalog and callable result shapes; descriptors are
shared and must be treated as read-only. Refresh explicitly when changing the
compiler pin, updating its URL and hash together in `build.zig.zon`.
