#!/usr/bin/env bash
set -euo pipefail

# Verify the Roc code shown in the `.roc-interactive` widgets on the website
# actually compiles and runs with the current Roc compiler -- the same nightly
# used to build the docs.
#
# Each widget stores its source as the div's text content. An HTML comment
# (`<!-- -->`) separates the top-level definitions from `main!`; the browser
# excludes comments from `textContent` before handing the source to the
# compiler, so we strip those comment lines here to reconstruct the exact
# program the visitor runs.

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
  # own `.roc` file, dropping the `<!-- -->` comment separators.
  awk -v out_dir="$work_dir" -v base="$base" '
    /<div class="roc-interactive/ { in_block = 1; n++; next }
    in_block && /<\/div>/         { in_block = 0; next }
    in_block {
      if ($0 ~ /^[[:space:]]*<!--.*-->[[:space:]]*$/) next
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
