{
  description = "Dev shell for the AI Revenue Agent Platform (Bun/TypeScript monorepo)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.bun
            pkgs.nodejs_20
            pkgs.postgresql
          ];

          shellHook = ''
            echo "bun:  $(bun --version)"
            echo "node: $(node --version)"
          '';
        };
      });
}
