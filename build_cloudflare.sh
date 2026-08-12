#!/bin/bash

set -euxo pipefail

repo_root="$(pwd)"
roc_tag="$(sed -n 's/^[[:space:]]*roc: "\([^"]*\)",$/\1/p' website/build_website.roc)"
roc_version="${roc_tag#nightly-}"
roc_asset="roc_nightly-linux_x86_64-${roc_version}.tar.gz"
roc_dir="$repo_root/.cache/cloudflare-roc"

mkdir -p "$repo_root/.cache"
curl -fsSL \
  -o "$repo_root/.cache/$roc_asset" \
  "https://github.com/roc-lang/nightlies/releases/download/$roc_tag/$roc_asset"
mkdir -p "$roc_dir"
tar -xzf "$repo_root/.cache/$roc_asset" -C "$roc_dir" --strip-components=1
"$roc_dir/roc" version
export PATH="$roc_dir:$PATH"

# Install the no-npm asset minifier used by the production build.
export GOBIN="$repo_root/gobin"
mkdir -p "$GOBIN"
go install github.com/tdewolff/minify/v2/cmd/minify@v2.24.13
export PATH="$GOBIN:$PATH"

cd website
roc check build_website.roc
roc check static_site_gen.roc
roc build build_website.roc
./build_website --roc="$roc_dir/roc" --minify
