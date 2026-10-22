-- REPOS spoon draws widget for
CREATE TABLE repositories (
    id          BIGSERIAL PRIMARY KEY,
    github_id   BIGINT NOT NULL UNIQUE,
    owner       TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- index here makes lookup by name fast and blocks duplicates e.g "Octocat/Hello" vs "octocat/hello"
CREATE UNIQUE INDEX repositories_owner_name_idx
    ON repositories (lower(owner), lower(name));

-- people who have forked at least one repo
CREATE TABLE forkers (
    id          BIGSERIAL PRIMARY KEY,
    github_id   BIGINT NOT NULL UNIQUE,
    login       TEXT   NOT NULL,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one row per fork = which repo was worked and by whom
CREATE TABLE forks (
    id              BIGSERIAL PRIMARY KEY,
    github_id       BIGSERIAL NOT NULL UNIQUE,
    repository_id   BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE, -- deleting a repo cleans up its forks
    forker_id       BIGINT NOT NULL REFERENCES forkers(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRs opened from forks back into a tracked repo
CREATE TABLE pull_requests (
    id              BIGSERIAL PRIMARY KEY,
    github_id       BIGINT NOT NULL UNIQUE,
    repository_id   BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    forker_id       BIGINT NOT NULL REFERENCES forkers(id) ON DELETE CASCADE,
    number          INTEGER NOT NULL,
    title           TEXT NOT NULL,

    -- added a check so that db itself rejects impossible values
    state           TEXT NOT NULL CHECK (state IN ('open', 'closed', 'merged')),
    merged_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- since foreign keys are not indexed automatically in Postgres... I index them here
CREATE INDEX forks_repository_idx   ON      forks (repository_id);
CREATE INDEX prs_repo_state_idx     ON      pull_requests (repository_id, state);
CREATE INDEX prs_forker_idx         ON      pull_requests (forker_id);