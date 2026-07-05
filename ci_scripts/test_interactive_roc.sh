#!/usr/bin/env bash
set -euo pipefail

# Verify the Roc code shown in the `.roc-interactive` widgets on the website
# actually compiles and runs with the current Roc compiler -- the same nightly
# used to build the docs.
#
# Each widget stores its source inside a `<pre class="roc-source">` element,
# alongside a static `<button class="roc-run">`. In the browser, compiler.js
# removes that button and then reads the div's `textContent` -- so the `<pre>`
# tags and the `<!-- -->` comment that separates the top-level definitions from
# `main!` never reach the compiler. We reconstruct the exact program the visitor
# runs by stripping the `<pre>`/`</pre>` tags, replacing the comment lines with
# blank lines (the comment node contributes nothing to `textContent`, but the
# surrounding newlines stay), and skipping the Run button line.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENT_DIR="$ROOT_DIR/website/content"

# Allow overriding the compiler (defaults to `roc` on PATH, as used in CI).
ROC="${ROC:-roc}"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

extracted=0
failures=0

while IFS= read -r md_file; do
  base="$(basename "$md_file" .md)"

  # Split each `<div class="roc-interactive ...">` ... `</div>` block into its
  # own `.roc` file, turning the `<!-- -->` comment separators into blank lines.
  awk -v out_dir="$work_dir" -v base="$base" '
    /<div class="roc-interactive/ { in_block = 1; n++; next }
    in_block && /<\/div>/         { in_block = 0; next }
    in_block {
      if ($0 ~ /^[[:space:]]*<!--.*-->[[:space:]]*$/) { print "" > (out_dir "/" base "_" n ".roc"); next }
      if ($0 ~ /<button class="roc-run"/) next
      gsub(/<pre class="roc-source">/, "")
      gsub(/<\/pre>/, "")
      print > (out_dir "/" base "_" n ".roc")
    }
  ' "$md_file"
done < <(grep -rl 'class="roc-interactive' "$CONTENT_DIR")

# Golden output each widget must produce when run. Keyed by the generated
# `<md-basename>_<n>.roc` name. Asserting the exact output means the test
# catches silent behaviour changes, not just compile/run failures. Update the
# expected value here when you intentionally change a widget's example.
expected_output() {
  case "$1" in
    index_1.roc)
      printf -- '- Write blog post \n\n- Call mom \n\n'
      ;;
    *)
      return 1
      ;;
  esac
}

shopt -s nullglob
for roc_file in "$work_dir"/*.roc; do
  extracted=$((extracted + 1))
  name="$(basename "$roc_file")"
  echo "==> Testing interactive widget: $name"
  echo "--- source ---"
  cat "$roc_file"
  echo "--- roc check ---"
  if ! "$ROC" check "$roc_file"; then
    echo "::error::roc check failed for an interactive widget ($name)"
    failures=$((failures + 1))
    continue
  fi
  echo "--- roc run ---"
  actual_file="$work_dir/$name.out"
  if ! "$ROC" "$roc_file" > "$actual_file" 2>&1; then
    cat "$actual_file"
    echo "::error::running an interactive widget failed ($name)"
    failures=$((failures + 1))
    continue
  fi
  cat "$actual_file"

  if expected_output "$name" > "$work_dir/$name.expected"; then
    if ! diff -u "$work_dir/$name.expected" "$actual_file"; then
      echo "::error::output of interactive widget ($name) did not match the expected output"
      failures=$((failures + 1))
    fi
  else
    echo "::warning::no expected output registered for $name; only ran it (add one in ci_scripts/test_interactive_roc.sh)"
  fi
done

if [ "$extracted" -eq 0 ]; then
  echo "::error::No .roc-interactive widgets found under $CONTENT_DIR"
  exit 1
fi

if [ "$failures" -ne 0 ]; then
  echo "$failures interactive widget(s) failed."
  exit 1
fi

echo "All $extracted interactive widget(s) passed."
