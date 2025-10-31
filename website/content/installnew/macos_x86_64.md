# MacOS x86_64

## How to install Roc

1. Download the latest roc alpha release using the terminal:

    ```sh
    curl -OL TODO
    ```

1. Untar the archive:

    ```sh
    tar xf roc-macos_x86_64-alpha4-rolling.tar.gz
    cd roc_night<TAB TO AUTOCOMPLETE>
    ```

1. To be able to run the `roc` command anywhere on your system; add the line below to your shell startup script (.profile, .zshrc, ...):

    ```sh
    export PATH=$PATH:~/path/to/roc_nightly-macos_x86_64-<VERSION>
    ```

1. Check everything worked by executing `roc version`

1. Download and run hello world:

    ```sh
    curl -OL https://raw.githubusercontent.com/roc-lang/examples/refs/heads/main/examples/HelloWorld/main.roc
    roc main.roc
    ```

## Next Steps

<!-- TODO - [editor setup](https://www.roc-lang.org/install#editor-extensions)  -->
- [Tutorial](https://www.roc-lang.org/tutorial)
- [Examples](https://www.roc-lang.org/examples)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc)
