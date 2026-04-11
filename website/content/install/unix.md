# Linux / macOS

## How to install Roc

1. Download the roc install script and execute it:

    ```sh
    curl --proto '=https' --tlsv1.2 -sSf https://roc-lang.org/install_roc.sh | sh 
    ```

1. In a new terminal, download and run hello world:

    ```sh
    curl --proto '=https' --tlsv1.2 -OL https://raw.githubusercontent.com/roc-lang/roc/refs/heads/main/test/echo/hello.roc
    roc hello.roc
    ```

## Next Steps

<!-- TODO - [editor setup](https://www.roc-lang.org/install#editor-extensions)  -->
- [Tutorial](https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md)
- [Examples](https://www.roc-lang.org/examples) (still on Roc alpha 4)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc) (still on Roc alpha 4)
