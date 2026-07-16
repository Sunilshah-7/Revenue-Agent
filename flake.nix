{
  description = "Dev shell for the AI Revenue Agent Platform (Bun/TypeScript monorepo)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    process-compose-flake.url = "github:Platonic-Systems/process-compose-flake";
    services-flake.url = "github:juspay/services-flake";

    # Converts apps/api's (whole-workspace) bun.lock into a Nix expression
    # (bun.nix) that fetches every dependency tarball as its own tiny
    # fixed-output derivation, so `bun install` can run fully offline
    # inside the build sandbox. See Architecture.md's "Nix packaging"
    # section for why this was chosen over a hand-rolled FOD.
    bun2nix.url = "github:nix-community/bun2nix?ref=2.1.1";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, process-compose-flake, services-flake, bun2nix }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        # bun2nix's overlay adds `pkgs.bun2nix`, the CLI derivation with
        # `.mkDerivation` / `.fetchBunDeps` / `.writeBunApplication`
        # attached via passthru -- see chat for how that's wired up
        # upstream. Purely additive: existing pkgs.* usages below are
        # unaffected.
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ bun2nix.overlays.default ];
        };

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
            # Only needed to regenerate bun.nix after bun.lock changes:
            #   bun2nix -o bun.nix
            pkgs.bun2nix
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

        # `nix build .#api` produces a runnable backend artifact with no
        # network access during the build. Dependencies come from bun.nix
        # (generated from bun.lock via `bun2nix -o bun.nix`, checked in --
        # regenerate it whenever bun.lock changes).
        #
        # This is a wrapper script around `bun run src/index.ts`, not a
        # `bun build --compile` binary: Elysia and BullMQ both rely on
        # dynamic `require()` internally (BullMQ loads Lua scripts and
        # optional ioredis internals at runtime), which Bun's compiler has
        # had trouble with. A wrapper script runs the real interpreter
        # against real files, so it behaves identically to `bun run` in
        # dev -- see chat for the Task 0 tradeoff discussion.
        packages.api = pkgs.bun2nix.writeBunApplication {
          pname = "arap-api";
          version = "1.0.0";

          # `self` is this flake's own source tree, filtered by Nix to only
          # git-tracked files -- .env*, node_modules, .direnv, .data, and
          # result are already excluded because .gitignore excludes them
          # from git, with no separate filtering step needed. This also
          # means uncommitted-but-unstaged new files are invisible to the
          # build until `git add`ed; see README's "Building with Nix"
          # section.
          src = self;

          bunDeps = pkgs.bun2nix.fetchBunDeps {
            bunNix = ./bun.nix;
          };

          # bun.lock is one lockfile for the whole workspace (root,
          # apps/api, apps/web), and bun2nix has no per-workspace filter,
          # so this `bun install` fetches and links apps/web's dependencies
          # too even though this package never runs it. Wasteful but still
          # hermetic -- see Architecture.md's Nix section for the tradeoff.
          dontUseBunBuild = true;
          # No native/postinstall-script dependencies in apps/api or
          # apps/web at present (verified against package.json deps); skip
          # lifecycle scripts rather than trust that stays true, since a
          # script trying to reach the network is exactly what the sandbox
          # is designed to catch (as a build failure, not silent skip).
          dontRunLifecycleScripts = true;

          startScript = ''
            cd apps/api
            exec bun run src/index.ts
          '';
        };

        packages.default = self.packages.${system}.api;

        # `nix flake check` builds this. bun test is deliberately NOT
        # wired in here: apps/api's tests need a live Postgres+Redis
        # (see apps/api/package.json's "test" script and .env.local), and
        # the build sandbox has no network/loopback-service access at all
        # -- there is no way for a sandboxed check to reach the
        # `nix run .#services` process. Test execution has to stay a
        # separate, explicit step (`bun run test:nix` after starting
        # services), not something `nix flake check` can ever validate.
        checks.api = self.packages.${system}.api;
      });
}
