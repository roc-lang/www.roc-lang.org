#!/usr/bin/env bash

# https://vaneyckt.io/posts/safer_bash_scripts_with_set_euxo_pipefail/
set -euo pipefail

# Redirect checker for roc-lang.org
#
# Verifies every rule in website/public/_redirects: that the old URL still
# answers with the expected redirect, and that following it lands on a page that
# exists. These URLs are linked from outside the site (e.g. the READMEs in
# roc-lang/examples, and anything that linked to the old /builtins/<Module>
# docs), so nothing on the site links to them -- which means check-links.sh,
# which only crawls links it finds, can never notice when they break.
#
# Usage:
#   ./check-redirects.sh                     # check https://www.roc-lang.org
#   ./check-redirects.sh --base-url URL      # e.g. a Cloudflare preview URL, or
#                                            # http://localhost:8080 for serve.py
#
# Every rule in _redirects must be covered by a case in EXPECTED below; a rule
# with no case is reported as a failure, so new rules can't land untested.
#
# Requires: bash and curl.

BASE_URL="https://www.roc-lang.org"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --base-url)
            BASE_URL="$2"
            shift
            ;;
        -h|--help)
            sed -n '6,22p' "$0"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1 (try --help)" >&2
            exit 2
            ;;
    esac
    shift
done
BASE_URL="${BASE_URL%/}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDIRECTS_FILE="$SCRIPT_DIR/../website/public/_redirects"

# One case per line: "<requested path> <expected Location>". The expected
# Location is compared as written in _redirects (fragment included); it is
# resolved against the base URL when relative. Following it must end in a 200.
EXPECTED=(
    "/tutorial https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md"
    "/builtins/Inspect /docs/main/Str/#inspect"
    "/builtins/Inspect/ /docs/main/Str/#inspect"
    "/builtins/main/Str/ /docs/main/Str/"
    "/builtins/alpha3/Str/ /docs/alpha3/Str/"
    "/builtins/alpha4/Str/ /docs/alpha4/Str/"
    "/builtins/main /docs/main/"
    "/builtins/alpha3 /docs/alpha3/"
    "/builtins/alpha4 /docs/alpha4/"
    "/builtins/Str/ /docs/main/Str/"
    "/builtins/Num /docs/main/Num"
    "/builtins/ /docs/main/"
    "/builtins /docs/main/"
    "/platforms /docs/main/langref/platforms/"
    "/platforms/ /docs/main/langref/platforms/"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

failures=0

echo "Checking redirects on $BASE_URL"
echo ""

# Resolve a possibly-relative expected Location against the base URL, so it can
# be compared with whatever form the server sends back.
absolute_url() {
    local url="$1"
    if [[ "$url" == http://* || "$url" == https://* ]]; then
        echo "$url"
    else
        echo "$BASE_URL$url"
    fi
}

for case_line in "${EXPECTED[@]}"; do
    request_path="${case_line%% *}"
    expected_location="${case_line#* }"
    url="$BASE_URL$request_path"

    # First hop only (no -L): both the status code and the Location matter.
    headers=$(curl -s -o /dev/null -D - --max-time 30 \
        --user-agent "roc-lang.org redirect checker" "$url" || true)
    status=$(echo "$headers" | head -n 1 | awk '{print $2}')
    # `tr -d '\r'` because header lines end in CRLF, which would otherwise be
    # part of the compared value.
    location=$(echo "$headers" | tr -d '\r' \
        | awk 'tolower($1) == "location:" {print $2; exit}')

    if [[ ! "$status" =~ ^30[128]$ ]]; then
        echo -e "${RED}✗${NC} $url: expected a redirect, got HTTP ${status:-no response}"
        failures=$((failures + 1))
        continue
    fi

    if [[ "$(absolute_url "$location")" != "$(absolute_url "$expected_location")" ]]; then
        echo -e "${RED}✗${NC} $url ($status) redirects to the wrong place"
        echo "    expected: $expected_location"
        echo "    actual:   ${location:-<no Location header>}"
        failures=$((failures + 1))
        continue
    fi

    # The destination must actually exist -- a redirect to a 404 is still a
    # broken link. Follow the whole chain (docs paths add their own trailing
    # slash redirect) and require a 200 at the end.
    final=$(curl -s -L -o /dev/null -w "%{http_code} %{url_effective}" --max-time 30 \
        --user-agent "roc-lang.org redirect checker" "$url" || true)
    final_status="${final%% *}"
    final_url="${final#* }"

    if [[ "$final_status" != "200" ]]; then
        echo -e "${RED}✗${NC} $url ($status -> $location) ends at HTTP $final_status ($final_url)"
        failures=$((failures + 1))
        continue
    fi

    echo -e "${GREEN}✓${NC} $url ($status) -> $location"
done

# Every rule in _redirects must have a case above. This walks the rules in file
# order for each requested path and marks the first one that matches -- the same
# way Cloudflare picks a rule -- so a case shadowed by an earlier rule doesn't
# count as covering the later one.
echo ""
echo "=== Checking that every rule in _redirects is covered ==="

if [[ ! -f "$REDIRECTS_FILE" ]]; then
    echo -e "${RED}✗${NC} $REDIRECTS_FILE not found"
    exit 1
fi

# Load rule sources into an array, skipping comments and blank lines.
rule_sources=()
while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"   # strip leading whitespace
    [[ -z "$line" || "$line" == \#* ]] && continue
    rule_sources+=("${line%% *}")
done < "$REDIRECTS_FILE"

# Index (into rule_sources) of the first rule matching a path, or -1. Paths are
# compared exactly, without normalizing trailing slashes, because that is how
# Cloudflare matches -- which is why _redirects lists both /builtins/Inspect and
# /builtins/Inspect/, and why each needs its own case here.
first_matching_rule() {
    local path="$1" i source prefix
    for i in "${!rule_sources[@]}"; do
        source="${rule_sources[$i]}"
        if [[ "$source" == *"*" ]]; then
            prefix="${source%\*}"
            if [[ "$path" == "$prefix"* ]]; then
                echo "$i"
                return
            fi
        elif [[ "$source" == "$path" ]]; then
            echo "$i"
            return
        fi
    done
    echo "-1"
}

covered=()
for _ in "${!rule_sources[@]}"; do covered+=("no"); done
for case_line in "${EXPECTED[@]}"; do
    idx=$(first_matching_rule "${case_line%% *}")
    [[ "$idx" != "-1" ]] && covered[$idx]="yes"
done

for i in "${!rule_sources[@]}"; do
    if [[ "${covered[$i]}" == "yes" ]]; then
        echo -e "${GREEN}✓${NC} ${rule_sources[$i]}"
    else
        echo -e "${RED}✗${NC} ${rule_sources[$i]} has no test case in this script"
        failures=$((failures + 1))
    fi
done

echo ""
if [[ "$failures" -gt 0 ]]; then
    echo -e "${RED}Redirect problems found: $failures${NC}"
    exit 1
fi

echo -e "${GREEN}All redirects are working!${NC}"
