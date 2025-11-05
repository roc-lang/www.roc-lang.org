# Windows

## How to install Roc

1. Open **PowerShell** (you can press **Win + X → Windows PowerShell**).

2. Download and run the Roc installer script:

    ```powershell
    irm https://roc-lang.org/install_roc.ps1 | pwsh
    ```

    > If your PowerShell says scripts are blocked, run PowerShell **as Administrator** just for the install, or start it like this:
    >
    > ```powershell
    > powershell -ExecutionPolicy Bypass
    > ```

3. Close that PowerShell window and open a **new** one so the updated PATH is picked up.

4. In the new PowerShell, download and run Hello World:

    ```powershell
    curl.exe -OL https://raw.githubusercontent.com/roc-lang/examples/refs/heads/main/examples/HelloWorld/main.roc
    roc main.roc
    ```

## Next Steps

<!-- TODO - [editor setup](https://www.roc-lang.org/install#editor-extensions)  -->
- [Tutorial](https://www.roc-lang.org/tutorial)
- [Examples](https://www.roc-lang.org/examples)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc)

