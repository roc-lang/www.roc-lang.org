#!/usr/bin/env bash

# https://vaneyckt.io/posts/safer_bash_scripts_with_set_euxo_pipefail/
set -euo pipefail

# Link checker for roc-lang.org
# Recursively checks internal links on the website, to make sure none of them are broken.
# Also checks external links non-recursively.
#
# Usage:
#   ./check-links.sh [max_depth]
#       Check the production site (https://www.roc-lang.org) as before.
#
#   ./check-links.sh --local [base_url] [--max-depth N]
#       Check a local dev deployment (default base http://localhost:8080, e.g.
#       what `python3 ./serve.py ./build 8080` serves). Implies --internal-only
#       (external links such as wikipedia.org are skipped entirely) and turns on
#       anchor checking. Handy for catching broken docs links before pushing.
#
# Other flags:
#   --base-url URL     Override the base URL to crawl.
#   --internal-only    Only follow internal links; don't check external ones.
#   --max-depth N      Recursion depth for internal links (positional N also works).
#   --check-anchors    Validate internal "#fragment" links against the target
#                      page's element ids (on by default with --local /
#                      --internal-only, since every page returns 200 and only the
#                      fragment is broken when a section is missing/renamed).
#   --no-anchors       Disable anchor checking.
#
# Requires: bash, curl, and python3 (used for fast, correct link extraction and
# URL resolution — the generated docs put thousands of sidebar links on every
# page, which a pure-bash per-link loop can't process in a reasonable time).

# Defaults (production behaviour, unchanged when no flags are passed).
BASE_URL="https://www.roc-lang.org"
MAX_DEPTH=""          # resolved below: 8 for local/internal-only, else 3
INTERNAL_ONLY=false
# Anchor checking is only meaningful for internal pages (we can't rely on the
# markup of third-party pages), so it defaults on with --internal-only/--local
# and off for a plain production run to keep that path's behaviour identical.
CHECK_ANCHORS=""      # "" = auto (follow INTERNAL_ONLY), "true"/"false" = forced

# Parse arguments. A bare number is still accepted as the max depth for
# backwards compatibility with the old `./check-links.sh [max_depth]` interface.
while [[ $# -gt 0 ]]; do
    case "$1" in
        --local)
            INTERNAL_ONLY=true
            # An optional non-flag value overrides the default local base URL.
            if [[ $# -gt 1 && "$2" != --* ]]; then
                BASE_URL="$2"
                shift
            else
                BASE_URL="http://localhost:8080"
            fi
            ;;
        --base-url)
            BASE_URL="$2"
            shift
            ;;
        --internal-only)
            INTERNAL_ONLY=true
            ;;
        --max-depth)
            MAX_DEPTH="$2"
            shift
            ;;
        --check-anchors)
            CHECK_ANCHORS=true
            ;;
        --no-anchors)
            CHECK_ANCHORS=false
            ;;
        -h|--help)
            sed -n '6,36p' "$0"
            exit 0
            ;;
        *)
            if [[ "$1" =~ ^[0-9]+$ ]]; then
                MAX_DEPTH="$1"
            else
                echo "Unknown argument: $1 (try --help)" >&2
                exit 2
            fi
            ;;
    esac
    shift
done

# Resolve deferred defaults now that all flags are known.
if [[ -z "$MAX_DEPTH" ]]; then
    if [[ "$INTERNAL_ONLY" == true ]]; then MAX_DEPTH=8; else MAX_DEPTH=3; fi
fi
if [[ -z "$CHECK_ANCHORS" ]]; then
    CHECK_ANCHORS="$INTERNAL_ONLY"
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required (used for link extraction)." >&2
    exit 2
fi

# Host of the base URL (e.g. "localhost:8080"), used to classify links as
# internal regardless of the base URL's path. `sed -E` (extended regex) is
# required for `https?` — BSD/macOS sed doesn't honour `\?` in basic regex.
BASE_DOMAIN=$(echo "$BASE_URL" | sed -E 's|^https?://||; s|/.*||')

TEMP_DIR=$(mktemp -d)
VISITED_FILE="$TEMP_DIR/visited_urls"
QUEUE_FILE="$TEMP_DIR/queue"
EXTERNAL_LINKS_FILE="$TEMP_DIR/external_links"
ERRORS_FILE="$TEMP_DIR/errors"
# Anchor checking: IDS_FILE records "page<TAB>id" for every id/name found on an
# internal page; FRAGMENTS_FILE records "target_page<TAB>fragment<TAB>source_page"
# for every internal link that carried a "#fragment". After the crawl we cross
# reference the two to find fragments with no matching id (broken anchors).
IDS_FILE="$TEMP_DIR/ids"
FRAGMENTS_FILE="$TEMP_DIR/fragments"
ANCHOR_ERRORS_FILE="$TEMP_DIR/anchor_errors"
EXTRACT_PY="$TEMP_DIR/extract_links.py"
VALIDATE_PY="$TEMP_DIR/validate_anchors.py"

# Extractor: reads a page's HTML on stdin and prints one line per href as
# "KIND<TAB>normalized_url<TAB>fragment", where KIND is INT or EXT. It resolves
# relative links (including ../), classifies internal vs external against the
# base URL, strips the fragment for the normalized page URL, and keeps the
# fragment separately for anchor checking. Doing all of this in one python pass
# per page (instead of a bash loop that spawns subprocesses per link) is what
# makes checking the docs — thousands of sidebar links per page — feasible.
write_extractor() {
    cat > "$EXTRACT_PY" <<'PYEOF'
import sys, re, urllib.parse

cur = sys.argv[1]
base = sys.argv[2]
base_host = urllib.parse.urlsplit(base).netloc
cur_page = cur.split('#', 1)[0]
html = sys.stdin.read()

def normalize(u):
    u = u.split('#', 1)[0]
    if u != base and u.endswith('/'):
        u = u[:-1]
    return u

# Emit three record types, each already de-duplicated for this page:
#   P<TAB>norm            an internal page to (maybe) crawl
#   F<TAB>norm<TAB>frag   an internal "#fragment" link, for anchor checking
#   X<TAB>norm            an external URL
# Bash routes these; cross-page de-duplication is handled downstream (the queue
# skips already-visited pages, external/fragments are de-duped when used). This
# keeps the hot path free of the bash 4 associative arrays macOS's bash lacks.
seen_p = set()
seen_f = set()
seen_x = set()
out = []
# Match href values that are double-quoted, single-quoted, or unquoted. The
# production/preview site is built with `--minify`, which strips attribute
# quotes (`href=../pattern-matching`), so a quotes-only pattern finds zero links
# and the crawl never recurses past the entry page.
for m in re.finditer(r'''href\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)''', html):
    raw = m.group(1)
    link = raw[1:-1] if raw[:1] in ('"', "'") else raw
    if (not link or link.startswith(('mailto:', 'tel:', 'javascript:'))
            or '/cdn-cgi/l/email-protection' in link):
        continue
    if link.startswith('#'):
        absu = cur_page + link
    else:
        absu = urllib.parse.urljoin(cur, link)
    if not absu.startswith(('http://', 'https://')):
        continue
    frag = absu.split('#', 1)[1] if '#' in absu else ''
    norm = normalize(absu)
    host = urllib.parse.urlsplit(absu).netloc
    internal = host == base_host or host.endswith('.' + base_host) or absu.startswith(base)
    if internal:
        if norm not in seen_p:
            seen_p.add(norm)
            out.append(f"P\t{norm}")
        if frag and (norm, frag) not in seen_f:
            seen_f.add((norm, frag))
            out.append(f"F\t{norm}\t{frag}")
    else:
        if norm not in seen_x:
            seen_x.add(norm)
            out.append(f"X\t{norm}")
sys.stdout.write("\n".join(out))
if out:
    sys.stdout.write("\n")
PYEOF
}

# Anchor validator: given the ids file ("page<TAB>id") and the fragments file
# ("page<TAB>fragment<TAB>source"), prints one line per problem fragment as
# "broken<TAB>page<TAB>frag<TAB>source" (page was fetched, so the anchor is
# genuinely missing) or "notfetched<TAB>..." (page never fetched — raise depth).
write_validator() {
    cat > "$VALIDATE_PY" <<'PYEOF'
import sys

ids = set()
pages = set()
with open(sys.argv[1], encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        page, _, idv = line.partition("\t")
        ids.add((page, idv))
        pages.add(page)

seen = set()
with open(sys.argv[2], encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        parts = line.split("\t")
        target, frag = parts[0], parts[1]
        source = parts[2] if len(parts) > 2 else ""
        if not frag or (target, frag) in seen:
            continue
        seen.add((target, frag))
        if (target, frag) in ids:
            continue
        kind = "broken" if target in pages else "notfetched"
        print(f"{kind}\t{target}\t{frag}\t{source}")
PYEOF
}

# URLs to ignore (skip checking these)
IGNORE_LIST=(
    "https://vimeo.com/653510682"
    "https://dl.acm.org/doi/pdf/10.1145/3591260"
    "https://ayazhafiz.com/articles/23/a-lambda-calculus-with-coroutines-and-heapless-closures"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "Starting link check for $BASE_URL (max depth: $MAX_DEPTH)"
if [[ "$INTERNAL_ONLY" == true ]]; then
    echo "Mode: internal-only (external links are skipped)"
fi
if [[ "$CHECK_ANCHORS" == true ]]; then
    echo "Anchor checking: on (internal #fragment links validated against page ids)"
fi
echo "Temporary files in: $TEMP_DIR"

write_extractor
write_validator
touch "$VISITED_FILE" "$EXTERNAL_LINKS_FILE" "$IDS_FILE" "$FRAGMENTS_FILE"

# Function to normalize URLs
normalize_url() {
    local url="$1"
    # Remove trailing slash unless it's the root
    if [[ "$url" != "$BASE_URL" ]]; then
        url="${url%/}"
    fi
    # Remove fragment identifiers
    url="${url%#*}"
    echo "$url"
}

# Pre-normalize the (tiny) ignore list once, then check membership with a plain
# array + string compare (no associative arrays, so this works on bash 3.2 too).
IGNORE_NORM=()
for ignore_url in "${IGNORE_LIST[@]}"; do
    IGNORE_NORM+=("$(normalize_url "$ignore_url")")
done
is_ignored() {
    local u="$1" ig
    for ig in "${IGNORE_NORM[@]}"; do
        [[ "$u" == "$ig" ]] && return 0
    done
    return 1
}

# Extract the element ids (and legacy name anchors) declared on a page, one per
# line. Used to validate that "#fragment" links actually point at something.
# Handles both quoted (`id="foo"`) and minified unquoted (`id=foo`) attributes;
# without the unquoted case every anchor on the minified build looks broken.
extract_ids() {
    printf '%s' "$1" | grep -oE "(id|name)=(\"[^\"]*\"|'[^']*'|[^ \"'>]+)" \
        | sed -E "s/^(id|name)=//; s/^[\"']//; s/[\"']\$//"
}

# True if a response body looks like an HTML document. Matches both the
# pretty-printed output (`<!DOCTYPE html>`, `<html>`) and the minified
# production/preview build (`<!doctype html><html lang=en>`) — the site is built
# with `--minify`, so the opening tags carry attributes and use lowercase. The
# case-insensitive character classes (`[Hh]`...) keep this from being fooled by
# either, so the crawler recurses into pages instead of stopping at the entry
# page. Substring `<html` (rather than requiring the closing `>`) is what the
# old link-extraction gate got wrong.
content_is_html() {
    [[ "$1" =~ \<[Hh][Tt][Mm][Ll] ]] || [[ "$1" =~ \<![Dd][Oo][Cc][Tt][Yy][Pp][Ee] ]]
}

# Function to check a single URL
check_url() {
    local url="$1"
    local depth="$2"
    local is_external="${3:-false}"

    if [[ "$is_external" == "true" ]]; then
        echo -e "${BLUE}Checking external:${NC} $url"
    else
        echo "Checking: $url (depth: $depth)"
    fi

    local normalized_url=$(normalize_url "$url")

    if is_ignored "$normalized_url"; then
        echo "Ignoring URL: $normalized_url"
        return 0
    fi

    if grep -Fxq "$normalized_url" "$VISITED_FILE" 2>/dev/null; then
        echo "Already visited: $normalized_url"
        return 0
    fi

    echo "$normalized_url" >> "$VISITED_FILE"

    # Make request with curl
    local response
    local status_code=""
    local effective_url=""
    local content=""
    local curl_ok=false
    local max_attempts=3
    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        curl_ok=false
        if response=$(curl -s -L -w "\n%{http_code}|%{url_effective}" --max-time 30 --user-agent "roc-lang.org link checker" "$url" 2>&1); then
            curl_ok=true
            local status_and_url=$(echo "$response" | tail -n 1)
            status_code=$(echo "$status_and_url" | cut -d'|' -f1)
            effective_url=$(echo "$status_and_url" | cut -d'|' -f2)
            # `sed '$d'` (delete last line) instead of `head -n -1`, because BSD/
            # macOS head rejects negative line counts. Strips the trailing
            # "status|url" line curl appended, leaving just the page body.
            content=$(echo "$response" | sed '$d')
            if [[ "$status_code" == "502" && $attempt -lt $max_attempts ]]; then
                echo -e "${YELLOW}⚠${NC} $url (502) - waiting 3s and retrying (attempt $attempt/$max_attempts)..."
                sleep 3
                attempt=$((attempt + 1))
                continue
            fi
        fi
        break
    done
    if [[ "$curl_ok" == "true" ]]; then
        if [[ "$status_code" -ge 200 && "$status_code" -lt 400 ]]; then
            if [[ "$is_external" == "true" ]]; then
                echo -e "${GREEN}✓${NC} $url ($status_code) ${BLUE}[external]${NC}"
            else
                echo -e "${GREEN}✓${NC} $url ($status_code)"
            fi

            # "Internal" means same host as the base URL — not same path prefix.
            # (When --local points at a subpath like /docs/main/langref/, sibling
            # pages such as /docs/main/Num are still internal and must have their
            # ids recorded for anchor checking. This matches how the python
            # extractor classifies links.)
            local is_internal_effective=false
            local eff_host=$(echo "$effective_url" | sed -E 's|^https?://||; s|[/?#].*||')
            if [[ "$eff_host" == "$BASE_DOMAIN" || "$eff_host" == *".$BASE_DOMAIN" ]]; then
                is_internal_effective=true
            fi

            # Record this internal page's ids so "#fragment" links to it can be
            # validated once the whole crawl is done.
            if [[ "$CHECK_ANCHORS" == true && "$is_external" == "false" && "$is_internal_effective" == true ]]; then
                if content_is_html "$content"; then
                    while IFS= read -r _id; do
                        [[ -n "$_id" ]] && printf '%s\t%s\n' "$normalized_url" "$_id" >> "$IDS_FILE"
                    done < <(extract_ids "$content")
                fi
            fi

            # Extract links for internal HTML pages until we hit max depth. Skip
            # if the URL redirected off-site.
            if [[ "$is_external" == "false" && "$depth" -lt "$MAX_DEPTH" && "$is_internal_effective" == true ]]; then
                if content_is_html "$content"; then
                    echo "Extracting links from HTML content..."

                    local internal_links_found=0
                    local external_links_found=0
                    local next_depth=$((depth + 1))
                    # The python extractor emits P/F/X records already de-duped
                    # for this page. We append P pages to the queue (the queue's
                    # dequeue step skips ones already visited) and F fragments to
                    # the fragments file (de-duped later, at validation time).
                    while IFS=$'\t' read -r rtype a b; do
                        case "$rtype" in
                            P)
                                is_ignored "$a" && continue
                                echo "$a,$next_depth" >> "$QUEUE_FILE"
                                internal_links_found=$((internal_links_found + 1))
                                ;;
                            F)
                                if [[ "$CHECK_ANCHORS" == true ]]; then
                                    printf '%s\t%s\t%s\n' "$a" "$b" "$effective_url" >> "$FRAGMENTS_FILE"
                                fi
                                ;;
                            X)
                                if [[ "$INTERNAL_ONLY" != true ]]; then
                                    is_ignored "$a" && continue
                                    echo "$a" >> "$EXTERNAL_LINKS_FILE"
                                    external_links_found=$((external_links_found + 1))
                                fi
                                ;;
                        esac
                    done < <(printf '%s' "$content" | python3 "$EXTRACT_PY" "$effective_url" "$BASE_URL")

                    echo "  Found $internal_links_found internal links, $external_links_found external links"
                fi
            fi
        else
            # Special handling: ignore HTTP 429 (Too Many Requests) and 403
            # (Forbidden) for every.org links. every.org rate-limits/blocks
            # automated requests like this checker's, so these codes there
            # don't indicate an actually broken link. Also ignore HTTP 429 for
            # youtube.com/youtu.be links, which rate-limits automated requests
            # the same way.
            if [[ ("$status_code" == "429" || "$status_code" == "403") && "$url" =~ every\.org ]]; then
                if [[ "$is_external" == "true" ]]; then
                    echo -e "${YELLOW}⚠${NC} $url ($status_code - ignoring for every.org) ${BLUE}[external]${NC}"
                else
                    echo -e "${YELLOW}⚠${NC} $url ($status_code - ignoring for every.org)"
                fi
            elif [[ "$status_code" == "429" && "$url" =~ (youtube\.com|youtu\.be) ]]; then
                if [[ "$is_external" == "true" ]]; then
                    echo -e "${YELLOW}⚠${NC} $url ($status_code - ignoring for youtube) ${BLUE}[external]${NC}"
                else
                    echo -e "${YELLOW}⚠${NC} $url ($status_code - ignoring for youtube)"
                fi
            else
                if [[ "$is_external" == "true" ]]; then
                    echo -e "${RED}✗${NC} $url ($status_code) ${BLUE}[external]${NC}"
                else
                    echo -e "${RED}✗${NC} $url ($status_code)"
                fi
                echo "$url - HTTP $status_code" >> "$ERRORS_FILE"
            fi
        fi
    else
        if [[ "$is_external" == "true" ]]; then
            echo -e "${RED}✗${NC} $url (connection failed) ${BLUE}[external]${NC}"
        else
            echo -e "${RED}✗${NC} $url (connection failed)"
        fi
        echo "$url - Connection failed: $response" >> "$ERRORS_FILE"
    fi
}

# Initialize queue with base URL
echo "$BASE_URL,0" > "$QUEUE_FILE"

# Process internal links queue
echo "=== Checking internal links recursively ==="
while [[ -s "$QUEUE_FILE" ]]; do
    # Get next URL from queue, then drop that first line. `tail -n +2` is used
    # instead of `sed -i '1d'` because BSD/macOS sed treats `-i` differently
    # (it needs an explicit backup suffix), which broke local runs on macOS.
    line=$(head -n 1 "$QUEUE_FILE")
    tail -n +2 "$QUEUE_FILE" > "$QUEUE_FILE.tmp" && mv "$QUEUE_FILE.tmp" "$QUEUE_FILE"

    url=$(echo "$line" | cut -d',' -f1)
    depth=$(echo "$line" | cut -d',' -f2)

    check_url "$url" "$depth" "false"

    echo "Queue size: $(wc -l < "$QUEUE_FILE" 2>/dev/null || echo 0)"
    echo "---"
done

# Process external links (non-recursively). The links were appended with
# possible duplicates (no per-link de-dup during the crawl), so collapse them
# here.
if [[ "$INTERNAL_ONLY" != true && -s "$EXTERNAL_LINKS_FILE" ]]; then
    sort -u "$EXTERNAL_LINKS_FILE" -o "$EXTERNAL_LINKS_FILE"
    echo ""
    echo "=== Checking external links (non-recursively) ==="
    external_count=$(wc -l < "$EXTERNAL_LINKS_FILE")
    echo "Found $external_count unique external links to check"
    echo ""

    while IFS= read -r external_url; do
        if [[ -n "$external_url" ]]; then
            check_url "$external_url" 0 "true"
            echo "---"
        fi
    done < "$EXTERNAL_LINKS_FILE"
fi

# Validate internal "#fragment" links against the ids we recorded per page.
# The validation (cross-referencing thousands of fragments against thousands of
# ids, de-duped) runs in python — sets there are far faster than a bash loop,
# and it avoids the bash 4 associative arrays macOS's bash lacks.
if [[ "$CHECK_ANCHORS" == true && -s "$FRAGMENTS_FILE" ]]; then
    echo ""
    echo "=== Checking internal anchors (#fragment links) ==="
    while IFS=$'\t' read -r kind target fragment source; do
        if [[ "$kind" == "broken" ]]; then
            echo -e "${RED}✗${NC} broken anchor: $target#$fragment (linked from $source)"
            echo "$target#$fragment - broken anchor (linked from $source)" >> "$ANCHOR_ERRORS_FILE"
        else
            echo -e "${YELLOW}⚠${NC} anchor target not fetched (raise --max-depth): $target#$fragment"
        fi
    done < <(python3 "$VALIDATE_PY" "$IDS_FILE" "$FRAGMENTS_FILE")
fi

echo ""
echo "Link checking complete!"

# Report results
total_checked=$(wc -l < "$VISITED_FILE")
internal_checked=$(grep -c "$BASE_DOMAIN" "$VISITED_FILE" 2>/dev/null || echo 0)
external_checked=$((total_checked - internal_checked))

echo "Total URLs checked: $total_checked"
echo "  Internal URLs: $internal_checked"
echo "  External URLs: $external_checked"

exit_code=0

if [[ -f "$ERRORS_FILE" && -s "$ERRORS_FILE" ]]; then
    error_count=$(wc -l < "$ERRORS_FILE")
    echo -e "${RED}Broken URLs found: $error_count${NC}"
    echo ""
    echo "Failed URLs:"
    cat "$ERRORS_FILE"
    exit_code=1
fi

if [[ -f "$ANCHOR_ERRORS_FILE" && -s "$ANCHOR_ERRORS_FILE" ]]; then
    anchor_error_count=$(wc -l < "$ANCHOR_ERRORS_FILE")
    echo -e "${RED}Broken anchors found: $anchor_error_count${NC}"
    echo ""
    echo "Failed anchors:"
    cat "$ANCHOR_ERRORS_FILE"
    exit_code=1
fi

if [[ "$exit_code" -eq 0 ]]; then
    echo -e "${GREEN}All links are working!${NC}"
fi

exit "$exit_code"
