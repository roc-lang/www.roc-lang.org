# Linux

## How to install Roc

1. Download the roc install script and execute it:

    ```sh
    curl --proto '=https' --tlsv1.2 -sSf https://roc-lang.org/install_roc.sh | sh
    ```

    Or install Roc from [nixpkgs](https://github.com/NixOS/nixpkgs/blob/nixos-unstable/pkgs/by-name/ro/roc/package.nix) using [Nix](https://nixos.org/download/):

    ```sh
    nix-env -f channel:nixpkgs-unstable -iA roc
    ```

    Stable NixOS releases still contain the old Roc compiler, so use `nixpkgs-unstable` or `nixos-unstable`.

1. In a new terminal, download and run hello world:

    ```sh
    curl --proto '=https' --tlsv1.2 -OL https://raw.githubusercontent.com/roc-lang/roc/refs/heads/main/test/echo/hello.roc
    roc hello.roc
    ```

## Next Steps

- [Editor Setup](/editors)
- [Tutorial](/tutorial/)
- [Examples](https://www.roc-lang.org/examples)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc)
