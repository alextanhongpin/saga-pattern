const statement = `
  CREATE TABLE IF NOT EXISTS saga_state (
    id uuid DEFAULT gen_random_uuid(),

    correlation_id uuid NOT NULL,
    name text NOT NULL,
    history jsonb[] NOT NULL DEFAULT '{}',

    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp,
    deleted_at timestamptz NULL,

    PRIMARY KEY (id),
    UNIQUE (correlation_id)
  )
`;

export default function migrate(db) {
  return db.query(statement);
}
