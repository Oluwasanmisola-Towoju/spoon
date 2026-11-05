-- support for receiving events from GH
-- a log of every webhook delivery that GH sends us
-- deduplicate so even if same delivery comes in twice the primary key makes a second insert fail
-- debugging easier now when something looks wrong in a widget we see which events arrived and which ones failed


CREATE TABLE webhook_deliveries (
    delivery_id     TEXT    PRIMARY KEY,
    event           TEXT    NOT NULL,
    action          TEXT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,  -- Null until a worker processes the webhook
    outcome         TEXT,  
    error           TEXT
);

ALTER TABLE pull_requests ADD COLUMN  source_updated_at TIMESTAMPTZ;  