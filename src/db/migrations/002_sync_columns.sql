-- Github's own total fork count is not always accurate, so we maintain our own count of forks for each repo. This column is updated by the sync script.
ALTER TABLE repositories ADD COLUMN forks_count INTEGER;

-- when last pulled fresh data
ALTER TABLLE repositories ADD COLUMN last_synced_at TIMESTAMPTZ;