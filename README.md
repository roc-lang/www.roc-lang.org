Contains everything needed to build the [Roc website](http://www.roc-lang.org/).

Build with:
```sh
cd website
# --cache prevents reprocessing for things that have not changed
roc ./build_website.roc --cache
# If you want a local deploy for development, do:
npx http-server ./build -c-1 -p 8080
```
