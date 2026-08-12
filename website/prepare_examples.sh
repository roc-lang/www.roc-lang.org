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
readonly build_dir=".cache/example-builds"

if [[ ! -f "$manifest" ]]; then
    echo "Missing examples manifest: $manifest" >&2
    exit 1
fi

mkdir -p .cache

python3 - "$manifest" "$manifest_records" <<'PY'
import json
import re
import sys

manifest_path, output_path = sys.argv[1:]
with open(manifest_path, encoding="utf-8") as source:
    manifest = json.load(source)

if set(manifest) != {"repository", "revision", "examples"}:
    raise SystemExit("examples.json must contain exactly repository, revision, and examples")

repository = manifest["repository"]
revision = manifest["revision"]
examples = manifest["examples"]
if repository != "https://github.com/roc-lang/examples":
    raise SystemExit(f"unsupported examples repository: {repository!r}")
if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
    raise SystemExit(f"revision must be one full lowercase Git commit SHA, got: {revision!r}")
if not isinstance(examples, list) or not examples:
    raise SystemExit("examples must be a non-empty list")

seen = set()
records = []
for position, example in enumerate(examples, 1):
    if not isinstance(example, dict) or set(example) != {"directory", "title", "validation"}:
        raise SystemExit(f"example {position} must contain exactly directory, title, and validation")
    directory = example["directory"]
    title = example["title"]
    validation = example["validation"]
    if not isinstance(directory, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", directory):
        raise SystemExit(f"invalid example directory at position {position}: {directory!r}")
    if directory in seen:
        raise SystemExit(f"duplicate example directory: {directory}")
    seen.add(directory)
    if not isinstance(title, str) or not title or any(char in title for char in "\t\r\n"):
        raise SystemExit(f"invalid title for {directory}: {title!r}")
    if not isinstance(validation, list) or not validation:
        raise SystemExit(f"validation for {directory} must be a non-empty list")
    for action in validation:
        if not isinstance(action, str):
            raise SystemExit(f"validation actions for {directory} must be strings")
        match = re.fullmatch(r"(build|build-dev|test):(.+)", action)
        if not match or match.group(2).startswith("/") or ".." in match.group(2):
            raise SystemExit(f"invalid validation action for {directory}: {action!r}")
    records.append((directory, title, ",".join(validation)))

with open(output_path, "w", encoding="utf-8", newline="\n") as output:
    output.write(f"{repository}\t{revision}\n")
    for record in records:
        output.write("\t".join(record) + "\n")
PY

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
   [[ ! -f "$content_dir/.dependency-roc-version" ]] ||
   [[ "$(<"$content_dir/.dependency-roc-version")" != "$website_roc_version" ]] ||
   ! cmp -s "$manifest" "$content_dir/.manifest"; then
    refresh_examples=true
fi

if [[ "$refresh_examples" == true ]]; then
    rm -rf "$extracted_dir" "$content_dir"
    mkdir -p "$extracted_dir" "$content_dir"
    unzip -q "$archive" -d "$extracted_dir"

    readonly source_root="$extracted_dir/examples-${examples_sha}"
    if [[ ! -f "$source_root/.roc-version" ]]; then
        echo "Pinned examples commit does not declare .roc-version" >&2
        exit 1
    fi
    readonly dependency_roc_version="$(tr -d '\r\n' < "$source_root/.roc-version")"

    if [[ "$dependency_roc_version" != "$website_roc_version" ]]; then
        echo "The pinned examples dependency uses a different Roc compiler." >&2
        echo "  website: $website_roc_version" >&2
        echo "  examples: $dependency_roc_version" >&2
        echo "Update roc-lang/examples on main first, then select a compatible revision in $manifest." >&2
        exit 1
    fi

    {
        echo "# Examples"
        echo
        echo "These examples are built and tested with Roc ${website_roc_version}."
        echo
        echo "Their source comes from [roc-lang/examples at ${examples_sha:0:7}](${examples_repo}/tree/${examples_sha}/examples)."
        echo
    } > "$content_dir/index.md"

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
        printf -- '- [%s](/examples/%s/README.html)\n' "$title" "$directory" >> "$content_dir/index.md"
    done < <(tail -n +2 "$manifest_records")

    if [[ "$example_count" -eq 0 ]]; then
        echo "Examples manifest has no entries: $manifest" >&2
        exit 1
    fi

    printf '%s' "$examples_sha" > "$content_dir/.source-revision"
    printf '%s' "$dependency_roc_version" > "$content_dir/.dependency-roc-version"
    cp "$manifest" "$content_dir/.manifest"
    rm -rf "$extracted_dir"
else
    readonly dependency_roc_version="$website_roc_version"
fi

# The version check must run even when the fetched content is reused.
if [[ "$(<"$content_dir/.dependency-roc-version")" != "$website_roc_version" ]]; then
    echo "Cached examples were prepared with a different Roc compiler; refreshing is required." >&2
    exit 1
fi

rm -rf "$build_dir"
mkdir -p "$build_dir"

while IFS=$'\t' read -r directory _title actions; do
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
                (cd "$content_dir/$directory" && "$roc_bin" build --no-cache "$target" "--output=../../../$build_dir/$directory")
                ;;
            build-dev)
                (cd "$content_dir/$directory" && "$roc_bin" build --no-cache --opt=dev "$target" "--output=../../../$build_dir/$directory")
                ;;
            test)
                (cd "$content_dir/$directory" && "$roc_bin" test "$target")
                ;;
            *)
                echo "Unknown validation action '$kind' for $directory" >&2
                exit 1
                ;;
        esac
    done
done < <(tail -n +2 "$manifest_records")
