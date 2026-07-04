#!/bin/bash

# https://vaneyckt.io/posts/safer_bash_scripts_with_set_euxo_pipefail/
set -euxo pipefail

# Download latest Roc nightly release
curl -fOL https://github.com/roc-lang/roc/releases/download/nightly/roc_nightly-linux_x86_64-latest.tar.gz

# rename nightly tar
mv $(ls | grep "roc_nightly.*tar\.gz") roc_nightly.tar.gz

# decompress the tar
tar -xzf roc_nightly.tar.gz

rm roc_nightly.tar.gz

# simplify nightly folder name
mv roc_nightly* roc_nightly

./roc_nightly/roc version

# make roc command available
export PATH=$PATH:$(pwd)/roc_nightly

# Install the no-npm asset minifier used by the production build.
# GOBIN is set explicitly because installing this package can trigger Go's
# automatic toolchain switch (it requires a newer Go than what's active),
# and `go env GOPATH` queried afterwards can then resolve to a different
# directory than the one the switched toolchain actually installed into.
export GOBIN="$(pwd)/gobin"
mkdir -p "$GOBIN"
go install github.com/tdewolff/minify/v2/cmd/minify@v2.24.13
export PATH=$PATH:$GOBIN

cd website
roc check build_website.roc
roc build build_website.roc
./build_website --minify
