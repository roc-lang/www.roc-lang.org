#!/usr/bin/env bash

# Fails if any HTML file under the given directories has whitespace right after
# an opening <samp> tag. Inside <pre>, that whitespace shows up as blank lines
# at the top of the code block. See https://github.com/roc-lang/roc/issues/12670

set -euo pipefail

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <dir>..." >&2
    exit 2
fi

pattern='<samp\b[^>]*>\s'
found=0

for dir in "$@"; do
    if [[ ! -d "$dir" ]]; then
        echo "Not a directory: $dir" >&2
        exit 2
    fi

    while IFS= read -r -d '' file; do
        # -z reads the whole file as one record, so \s also matches newlines.
        # grep exits 1 when nothing matches, which is the passing case.
        count="$({ grep -Pzo "$pattern" "$file" || true; } | tr -cd '\0' | wc -c)"
        if [[ "$count" -gt 0 ]]; then
            echo "$file: $count <samp> tag(s) followed by whitespace"
            found=1
        fi
    done < <(find "$dir" -type f -name '*.html' -print0)
done

if [[ "$found" -ne 0 ]]; then
    echo "Remove the whitespace right after <samp>; it renders as blank lines at the top of code blocks." >&2
    exit 1
fi
