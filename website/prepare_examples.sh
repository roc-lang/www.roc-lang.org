#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "usage: $0 /path/to/roc" >&2
    exit 1
fi

readonly roc_arg="$1"
if [[ "$roc_arg" == /* ]]; then
    readonly roc_bin="$roc_arg"
else
    readonly roc_bin="$(cd "$(dirname "$roc_arg")" && pwd)/$(basename "$roc_arg")"
fi
readonly website_roc_version="$(sed -n 's/^[[:space:]]*roc: "\([^"]*\)",$/\1/p' build_website.roc)"
readonly manifest="examples.json"
readonly manifest_records=".cache/examples-manifest.tsv"
readonly content_dir="content/examples"
readonly example_versions=".cache/examples-versions.tsv"
readonly build_dir=".cache/example-builds"

if [[ ! -f "$manifest" ]]; then
    echo "Missing examples manifest: $manifest" >&2
    exit 1
fi

mkdir -p .cache

# Prints the one Roc nightly an example pins in its app header(s).
example_roc_version() {
    local versions
    versions="$(grep -rhoE --include='*.roc' 'roc: "nightly-[^"]+"' "$1" | sed -E 's/^roc: "(.*)"$/\1/' | sort -u || true)"
    if [[ -z "$versions" || "$versions" == *$'\n'* ]]; then
        echo "$1 must pin exactly one Roc nightly, found: ${versions:-none}" >&2
        return 1
    fi
    echo "$versions"
}

# Prints the roc binary of a nightly: the website's own, or one downloaded into .cache/<tag>/.
roc_for_version() {
    local tag="$1"
    if [[ "$tag" == "$website_roc_version" ]]; then
        echo "$roc_bin"
        return
    fi

    local suffix arch
    suffix="${tag#nightly-}"
    case "$(uname -s)-$(uname -m)" in
        Linux-x86_64) arch="linux_x86_64" ;;
        Linux-aarch64 | Linux-arm64) arch="linux_arm64" ;;
        Darwin-arm64) arch="macos_apple_silicon" ;;
        Darwin-x86_64) arch="macos_x86_64" ;;
        *) echo "unsupported platform: $(uname -sm)" >&2; return 1 ;;
    esac

    local dir=".cache/$tag"
    if [[ ! -x "$dir/roc" ]]; then
        local tmp
        tmp="$(mktemp -d .cache/.tmp.XXXXXX)"
        curl -fsSL --retry 5 "https://github.com/roc-lang/nightlies/releases/download/${tag}/roc_nightly-${arch}-${suffix}.tar.gz" |
            tar -xz -C "$tmp" --strip-components=1
        rm -rf "$dir"
        mv "$tmp" "$dir"
    fi
    echo "$PWD/$dir/roc"
}

python3 examples.py records "$manifest" "$manifest_records"

IFS=$'\t' read -r examples_repo examples_sha < "$manifest_records"
readonly examples_repo examples_sha
readonly archive=".cache/examples-${examples_sha}.zip"
readonly extracted_dir=".cache/examples-${examples_sha}"

if [[ ! -f "$archive" ]]; then
    readonly archive_tmp="${archive}.download"
    rm -f "$archive_tmp"
    curl -fsSL -o "$archive_tmp" "$examples_repo/archive/${examples_sha}.zip"
    mv "$archive_tmp" "$archive"
fi

refresh_examples=false
if [[ ! -d "$content_dir" ]] ||
   [[ ! -f "$content_dir/.source-revision" ]] ||
   [[ "$(<"$content_dir/.source-revision")" != "$examples_sha" ]] ||
   [[ ! -f "$content_dir/.manifest" ]] ||
   [[ ! -f "$example_versions" ]] ||
   [[ ! -f "$content_dir/.roc-version" ]] ||
   [[ "$(<"$content_dir/.roc-version")" != "$website_roc_version" ]] ||
   ! cmp -s "$manifest" "$content_dir/.manifest"; then
    refresh_examples=true
fi

if [[ "$refresh_examples" == true ]]; then
    rm -rf "$extracted_dir" "$content_dir"
    mkdir -p "$extracted_dir" "$content_dir"
    unzip -q "$archive" -d "$extracted_dir"

    readonly source_root="$extracted_dir/examples-${examples_sha}"

    : > "$example_versions"

    example_count=0
    while IFS=$'\t' read -r directory title actions; do
        example_count=$((example_count + 1))
        if [[ ! -d "$source_root/examples/$directory" ]]; then
            echo "Pinned examples commit has no examples/$directory directory" >&2
            exit 1
        fi
        if [[ ! -f "$source_root/examples/$directory/README.md" ]]; then
            echo "Pinned example $directory has no README.md" >&2
            exit 1
        fi

        cp -R "$source_root/examples/$directory" "$content_dir/$directory"
        example_version="$(example_roc_version "$content_dir/$directory")"
        printf '%s\t%s\n' "$directory" "$example_version" >> "$example_versions"
    done < <(tail -n +2 "$manifest_records")

    if [[ "$example_count" -eq 0 ]]; then
        echo "Examples manifest has no entries: $manifest" >&2
        exit 1
    fi

    printf '%s' "$examples_sha" > "$content_dir/.source-revision"
    printf '%s' "$website_roc_version" > "$content_dir/.roc-version"
    cp "$manifest" "$content_dir/.manifest"
    rm -rf "$extracted_dir"
fi

python3 examples.py index "$manifest" "$example_versions" "$website_roc_version" "$content_dir/index.md"

rm -rf "$build_dir"
mkdir -p "$build_dir"

while IFS=$'\t' read -r directory _title actions; do
    example_version="$(example_roc_version "$content_dir/$directory")"
    example_roc="$(roc_for_version "$example_version")"

    IFS=',' read -r -a validation_actions <<< "$actions"
    for action in "${validation_actions[@]}"; do
        kind="${action%%:*}"
        target="${action#*:}"
        if [[ "$kind" == "$action" || -z "$target" || "$target" == /* || "$target" == *..* ]]; then
            echo "Invalid validation action '$action' for $directory" >&2
            exit 1
        fi
        if [[ ! -f "$content_dir/$directory/$target" ]]; then
            echo "Validation target does not exist: $directory/$target" >&2
            exit 1
        fi

        case "$kind" in
            build)
                (cd "$content_dir/$directory" && "$example_roc" build --no-cache "$target" "--output=../../../$build_dir/$directory")
                ;;
            build-dev)
                (cd "$content_dir/$directory" && "$example_roc" build --no-cache --opt=dev "$target" "--output=../../../$build_dir/$directory")
                ;;
            test)
                (cd "$content_dir/$directory" && "$example_roc" test "$target")
                ;;
            *)
                echo "Unknown validation action '$kind' for $directory" >&2
                exit 1
                ;;
        esac
    done
done < <(tail -n +2 "$manifest_records")