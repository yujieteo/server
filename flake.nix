{
  description = "Pins for the starter";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      each = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = each (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bashInteractive git jq shellcheck gnutar
            go golangci-lint
            bun nodejs
            python3 ruff basedpyright
            rustc cargo clippy rustfmt
          ];
        };
      });
    };
}
