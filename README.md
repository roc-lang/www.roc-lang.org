Contains everything needed to build the [Roc website](http://www.roc-lang.org/).

Build with:
```sh
cd website
roc ./build_website.roc
# If you want to use your local roc compiler and source code:
roc ./build_website.roc --roc=/Users/username/gitrepos/allroc/roc6/roc/zig-out/bin/roc
# For a production build, minify copied assets too. This requires
# github.com/tdewolff/minify/v2/cmd/minify on PATH.
roc ./build_website.roc --minify
# If you want a local deploy for development, do:
python3 ./serve.py ./build 8080
```
