# Windows

## How to install Roc

1. Open a powershell terminal and download the latest Roc release:

    ```powershell
    Invoke-WebRequest -Uri "TODO: ADD LINK HERE" -OutFile "roc.zip"
    ```

1. Unzip the archive:

    ```powershell
    Expand-Archive .\roc.zip -DestinationPath "$env:USERPROFILE\roc"
    cd "$env:USERPROFILE\roc\<TODO FOLDER NAME>"
    ```

1. To be able to run the `roc` command anywhere on your system; execute:

    ```powershell
    setx PATH "$env:PATH;$env:USERPROFILE\roc\<TODO FOLDER NAME>"
    ```

1. To make sure everything worked, execute:

   ```powershell
   # Open a new powershell terminal first!
   roc version
   ```

1. Download and run hello world:

    ```powershell
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/roc-lang/examples/refs/heads/main/examples/HelloWorld/main.roc" -OutFile "main.roc"
    roc main.roc
    ```

## Next Steps

<!-- TODO - [editor setup](https://www.roc-lang.org/install#editor-extensions)  -->
- [Tutorial](https://www.roc-lang.org/tutorial)
- [Examples](https://www.roc-lang.org/examples)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc)

