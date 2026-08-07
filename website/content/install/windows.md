# Windows

## How to install Roc

1. Open a  **PowerShell Terminal** (you can press **Win + X → Terminal**).

2. Download and run the cross-platform Roc installer (requires Python 3):

    ```powershell
    irm https://roc-lang.org/install_roc.py -OutFile install_roc.py
    python install_roc.py
    ```

    > If `python` is not available, install Python 3 from [python.org](https://www.python.org/downloads/windows/) and try again.

3. Close that PowerShell window and open a **new** one so the updated PATH is picked up.

4. In the new PowerShell, download and run Hello World:

    ```powershell
    curl.exe -OL https://raw.githubusercontent.com/roc-lang/roc/refs/heads/main/test/echo/hello.roc
    roc hello.roc
    ```

## Next Steps

<!-- TODO - [editor setup](https://www.roc-lang.org/install#editor-extensions)  -->
- [Tutorial](https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md)
- [Examples](https://www.roc-lang.org/examples)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc) (still on Roc alpha 4)
