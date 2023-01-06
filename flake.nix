{
  description = "srvc brat";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    srvc.url = "github:insilica/rs-srvc";
  };
  outputs = { self, nixpkgs, flake-utils, srvc, ... }@inputs:
    flake-utils.lib.eachDefaultSystem (system:
      with import nixpkgs { inherit system; };
      let
        srvc-brat = stdenv.mkDerivation {
          name = "srvc-brat";
          src = ./.;

          installPhase = ''
            mkdir -p $out
          '';
        };
      in {
        packages = {
          inherit srvc-brat;
          default = srvc-brat;
        };
        devShells.default =
          mkShell { buildInputs = [ srvc.packages.${system}.default ]; };
      });
}
