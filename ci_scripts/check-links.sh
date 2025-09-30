#!/usr/bin/env bash

# https://vaneyckt.io/posts/safer_bash_scripts_with_set_euxo_pipefail/
set -euo pipefail

# Link checker for roc-lang.org
# Recursively checks internal links on the website, to make sure none of them are broken.
# Also checks external links non-recursively.
# Usage: ./check-links.sh [max_depth]

#BASE_URL="https://roc.cc02oj5kr.workers.dev/"
BASE_URL="https://www.roc-lang.org"
MAX_DEPTH=${1:-3}  # Default depth of 3 levels
TEMP_DIR=$(mktemp -d)
VISITED_FILE="$TEMP_DIR/visited_urls"
QUEUE_FILE="$TEMP_DIR/queue"
EXTERNAL_LINKS_FILE="$TEMP_DIR/external_links"
ERRORS_FILE="$TEMP_DIR/errors"

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
echo "Temporary files in: $TEMP_DIR"

# Initialize queue with base URL
echo "$BASE_URL,0" > "$QUEUE_FILE"
touch "$VISITED_FILE"
touch "$EXTERNAL_LINKS_FILE"

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

# Function to check if URL should be ignored
should_ignore_url() {
    local url="$1"
    local normalized_url=$(normalize_url "$url")
    
    for ignore_url in "${IGNORE_LIST[@]}"; do
        local normalized_ignore=$(normalize_url "$ignore_url")
        if [[ "$normalized_url" == "$normalized_ignore" ]]; then
            return 0  # Should ignore
        fi
    done
    return 1  # Should not ignore
}

# Function to check if URL is internal
is_internal_url() {
    local url="$1"
    local base_domain=$(echo "$BASE_URL" | sed 's|https\?://||' | sed 's|/.*||')
    [[ "$url" =~ ^https?://([^/]*\.)?${base_domain} ]] || [[ "$url" =~ ^${BASE_URL} ]]
}

# Function to extract links from HTML
extract_links() {
    local url="$1"
    local content="$2"
    
    # Extract all href attributes from the content
    echo "$content" | grep -oE 'href="[^"]*"' | sed 's/href="//g' | sed 's/"$//g' | while read -r link; do
        # Skip empty links, anchors, mailto, tel, email protection, etc.
        if [[ -z "$link" || "$link" =~ ^# || "$link" =~ ^mailto: || "$link" =~ ^tel: || "$link" =~ ^javascript: || "$link" =~ /cdn-cgi/l/email-protection ]]; then
            continue
        fi
        
        local full_url=""
        
        # Convert relative URLs to absolute
        if [[ "$link" =~ ^/ ]]; then
            full_url="$BASE_URL$link"
        elif [[ "$link" =~ ^https?:// ]]; then
            full_url="$link"
        elif [[ ! "$link" =~ ^[a-zA-Z][a-zA-Z0-9+.-]*: ]]; then
            # Relative path - construct from current URL
            local base_path="${url%/*}"
            if [[ "$link" =~ ^\.\. ]]; then
                # Handle ../relative paths
                full_url="$base_path/$link"
                # Resolve .. components
                while [[ "$full_url" =~ /[^/]+/\.\. ]]; do
                    full_url=$(echo "$full_url" | sed 's|/[^/]\+/\.\./|/|')
                done
            else
                full_url="$base_path/$link"
            fi
        fi
        
        if [[ -n "$full_url" ]]; then
            normalize_url "$full_url"
        fi
    done
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
    
    # Normalize URL for comparison
    local normalized_url=$(normalize_url "$url")
    
    # Check if URL should be ignored
    if should_ignore_url "$normalized_url"; then
        echo "Ignoring URL: $normalized_url"
        return 0
    fi
    
    # Check if already visited
    local already_visited=false
    if grep -Fxq "$normalized_url" "$VISITED_FILE" 2>/dev/null; then
        already_visited=true
    fi
    
    if [[ "$already_visited" == true ]]; then
        echo "Already visited: $normalized_url"
        return 0
    fi
    
    # Add to visited
    echo "$normalized_url" >> "$VISITED_FILE"
    
    # Make request with curl
    local response
    if response=$(curl -s -L -w "\n%{http_code}|%{url_effective}" --max-time 30 --user-agent "roc-lang.org link checker" "$url" 2>&1); then
        local status_and_url=$(echo "$response" | tail -n 1)
        local status_code=$(echo "$status_and_url" | cut -d'|' -f1)
        local effective_url=$(echo "$status_and_url" | cut -d'|' -f2)
        local content=$(echo "$response" | head -n -1)
        
        if [[ "$status_code" -ge 200 && "$status_code" -lt 400 ]]; then
            if [[ "$is_external" == "true" ]]; then
                echo -e "${GREEN}✓${NC} $url ($status_code) ${BLUE}[external]${NC}"
            else
                echo -e "${GREEN}✓${NC} $url ($status_code)"
            fi
            
            # Only extract links for internal URLs and if we haven't reached max depth
            if [[ "$is_external" == "false" && "$depth" -lt "$MAX_DEPTH" ]]; then
                # Check if it's HTML content by looking for HTML tags
                if [[ "$content" =~ \<html\> ]] || [[ "$content" =~ \<HTML\> ]] || [[ "$content" =~ \<!DOCTYPE\ html\> ]]; then
                    echo "Extracting links from HTML content..."
                    
                    # Extract links and categorize them
                    local internal_links_found=0
                    local external_links_found=0
                    while IFS= read -r link; do
                        if [[ -n "$link" ]]; then
                            local normalized_link=$(normalize_url "$link")
                            # Check if we've already visited this link
                            local already_visited=false
                            if grep -Fxq "$normalized_link" "$VISITED_FILE" 2>/dev/null; then
                                already_visited=true
                            fi
                            
                            if [[ "$already_visited" == false ]]; then
                                # Check if URL should be ignored
                                if should_ignore_url "$normalized_link"; then
                                    echo "  Ignoring link: $normalized_link"
                                    continue
                                fi
                                
                                if is_internal_url "$normalized_link"; then
                                    # Internal link - add to queue for recursive checking
                                    echo "$normalized_link,$((depth + 1))" >> "$QUEUE_FILE"
                                    internal_links_found=$((internal_links_found + 1))
                                    echo "  Found internal link: $normalized_link"
                                else
                                    # External link - add to external links file for non-recursive checking
                                    if ! grep -Fxq "$normalized_link" "$EXTERNAL_LINKS_FILE" 2>/dev/null; then
                                        echo "$normalized_link" >> "$EXTERNAL_LINKS_FILE"
                                        external_links_found=$((external_links_found + 1))
                                        echo "  Found external link: $normalized_link"
                                    fi
                                fi
                            fi
                        fi
                    done < <(extract_links "$effective_url" "$content")
                    
                    echo "  Added $internal_links_found internal links to queue"
                    echo "  Added $external_links_found external links for checking"
                fi
            fi
        else
            # Special handling: ignore HTTP 429 (Too Many Requests) for every.org links
            if [[ "$status_code" == "429" && "$url" =~ every\.org ]]; then
                if [[ "$is_external" == "true" ]]; then
                    echo -e "${YELLOW}⚠${NC} $url ($status_code - rate limited, ignoring) ${BLUE}[external]${NC}"
                else
                    echo -e "${YELLOW}⚠${NC} $url ($status_code - rate limited, ignoring)"
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

# Process internal links queue
echo "=== Checking internal links recursively ==="
while [[ -s "$QUEUE_FILE" ]]; do
    # Get next URL from queue
    line=$(head -n 1 "$QUEUE_FILE")
    sed -i '1d' "$QUEUE_FILE"
    
    url=$(echo "$line" | cut -d',' -f1)
    depth=$(echo "$line" | cut -d',' -f2)
    
    check_url "$url" "$depth" "false"
    
    echo "Queue size: $(wc -l < "$QUEUE_FILE" 2>/dev/null || echo 0)"
    echo "---"
done

# Process external links (non-recursively)
if [[ -s "$EXTERNAL_LINKS_FILE" ]]; then
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

echo ""
echo "Link checking complete!"

# Report results
total_checked=$(wc -l < "$VISITED_FILE")
internal_checked=$(grep -c "roc-lang.org" "$VISITED_FILE" 2>/dev/null || echo 0)
external_checked=$((total_checked - internal_checked))

echo "Total URLs checked: $total_checked"
echo "  Internal URLs: $internal_checked"
echo "  External URLs: $external_checked"

if [[ -f "$ERRORS_FILE" && -s "$ERRORS_FILE" ]]; then
    error_count=$(wc -l < "$ERRORS_FILE")
    echo -e "${RED}Errors found: $error_count${NC}"
    echo ""
    echo "Failed URLs:"
    cat "$ERRORS_FILE"
    exit 1
else
    echo -e "${GREEN}All links are working!${NC}"
    exit 0
fi
