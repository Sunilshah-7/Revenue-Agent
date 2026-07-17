-- Applied once, only the first time the `revenue_agent` database is created
-- by flake.nix's `services.postgres."pg".initialDatabases` (services-flake
-- skips this entirely on subsequent starts once ./.data/postgres exists).
CREATE EXTENSION IF NOT EXISTS vector;
