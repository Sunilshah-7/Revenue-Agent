{
  description = "Dev shell for the AI Revenue Agent Platform (Bun/TypeScript monorepo)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    process-compose-flake.url = "github:Platonic-Systems/process-compose-flake";
    services-flake.url = "github:juspay/services-flake";
  };

  outputs = { self, nixpkgs, flake-utils, process-compose-flake, services-flake }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # process-compose-flake's non-flake-parts entry point: given `pkgs`,
        # returns { evalModules, makeProcessCompose, ... }. We use this
        # instead of the more common flake-parts module so this stays a
        # plain flake-utils flake like the rest of flake.nix.
        # See: https://github.com/Platonic-Systems/process-compose-flake/blob/main/nix/lib.nix
        pcLib = import process-compose-flake.lib { inherit pkgs; };

        # Flakes evaluate purely by default: no reading the real shell
        # environment, no reading files git doesn't track (which is also
        # why `.data/`, below, must stay out of .gitignore's way but the
        # flake never reads it directly). `--impure` relaxes that just for
        # `builtins.getEnv`, so this can reuse the same gitignored root
        # `.env` credentials compose.local.yml already reads
        # (ARAP_LOCAL_DB_PASSWORD / ARAP_LOCAL_REDIS_PASSWORD) instead of a
        # password literal committed to git.
        requireEnv = name:
          let value = builtins.getEnv name;
          in
          if value == "" then
            throw ''
              ${name} is empty or unset. Set it in the repo-root .env (see
              .env.example) and run this command with --impure, e.g.:
                nix run --impure .#services
            ''
          else value;

        devDbPassword = requireEnv "ARAP_LOCAL_DB_PASSWORD";
        devRedisPassword = requireEnv "ARAP_LOCAL_REDIS_PASSWORD";
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

        # `nix run --impure .#services` starts local Postgres (with
        # pgvector) and Redis under process-compose, so apps/api can run
        # fully offline against loopback services instead of Neon/Upstash.
        # See Architecture.md's "Local development topology (Nix)" section.
        packages.services = pcLib.makeProcessCompose {
          name = "services";
          modules = [
            services-flake.processComposeModules.default
            {
              services.postgres."pg" = {
                enable = true;
                # postgresql_16 extended with the pgvector extension package
                # from the *same* major-version-scoped package set — see the
                # withPackages explanation in the chat, not inline here.
                package = pkgs.postgresql_16.withPackages (p: [ p.pgvector ]);
                listen_addresses = "127.0.0.1";
                port = 5432;
                dataDir = "./.data/postgres";
                initialScript.before = ''
                  CREATE ROLE devuser WITH LOGIN SUPERUSER PASSWORD '${devDbPassword}';
                '';
                initialDatabases = [
                  {
                    name = "revenue_agent";
                    # Declarative CREATE EXTENSION step — services-flake only
                    # runs this the first time (see setup-script.nix: schemas
                    # apply only when ./.data/postgres doesn't exist yet).
                    schemas = [ ./nix/postgres-init.sql ];
                  }
                ];
              };

              services.redis."redis" = {
                enable = true;
                bind = "127.0.0.1";
                port = 6379;
                dataDir = "./.data/redis";
                extraConfig = ''
                  requirepass ${devRedisPassword}
                '';
              };
            }
          ];
        };
      });
}
