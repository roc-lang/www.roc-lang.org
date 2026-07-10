Contains everything needed to build the [Roc website](http://www.roc-lang.org/).

Build with:
```sh
cd website
roc ./build_website.roc
# For a production build, minify copied assets too. Building requires
# Binaryen's wasm-opt, and minifying additionally requires
# github.com/tdewolff/minify/v2/cmd/minify on PATH.
roc ./build_website.roc --minify
# If you want a local deploy for development, do:
python3 ./serve.py ./build 8080
```
