{
  description = "Website devShell flake";

  inputs = {
    roc.url = "github:roc-lang/roc";

    nixpkgs.follows = "roc/nixpkgs";

    # to easily make configs for multiple architectures
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, roc, flake-utils }:
    let supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    in flake-utils.lib.eachSystem supportedSystems (system:
      let
        pkgs = import nixpkgs { inherit system; };

        rocPkgs = roc.packages.${system};

        aliases = ''
          alias buildcmd='roc ./build_website.roc'
          alias runcmd='npx http-server ./build -c-1 -p 8080'
        '';

        linuxInputs = with pkgs;
          lib.optionals stdenv.isLinux [
          ];

        darwinInputs = with pkgs;
          lib.optionals stdenv.isDarwin
          (with pkgs.darwin.apple_sdk.frameworks; [
            #Security
          ]);

        sharedInputs = (with pkgs; [
          nodejs_22
          rocPkgs.cli
        ]);
      in {

        devShell = pkgs.mkShell {
          buildInputs = sharedInputs ++ darwinInputs ++ linuxInputs;

          shellHook = ''
            ${aliases}
            
            echo "Some convenient command aliases:"
            echo "${aliases}" | grep -E "alias .*" -o | sed 's/alias /  /' | sed 's/=/ = /'
            echo ""
          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      });
}