# Windows

## How to install Roc

1. Open a  **PowerShell Terminal** (you can press **Win + X → Terminal**).

2. Download and run the Roc installer script:

    ```powershell
    irm https://roc-lang.org/install_roc.ps1 | iex
    ```

    > If your PowerShell says scripts are blocked, run PowerShell **as Administrator** just for the install, or start it like this:
    >
    > ```powershell
    > powershell -ExecutionPolicy Bypass
    > ```

3. Close that PowerShell window and open a **new** one so the updated PATH is picked up.

4. In the new PowerShell, download and run Hello World:

    ```powershell
    curl.exe -OL https://raw.githubusercontent.com/roc-lang/roc/refs/heads/main/test/echo/hello.roc
    roc hello.roc
    ```

## Next Steps

<!-- TODO - [editor setup](https://www.roc-lang.org/install#editor-extensions)  -->
- [Tutorial](https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md)
- [Examples](https://www.roc-lang.org/examples) (still on Roc alpha 4)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc) (still on Roc alpha 4)

