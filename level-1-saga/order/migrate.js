const statement = `
  CREATE SCHEMA IF NOT EXISTS "order";

  CREATE TABLE IF NOT EXISTS "order".entity(
    id uuid DEFAULT gen_random_uuid(),
    name text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp
  );

  CREATE TABLE IF NOT EXISTS "order".event (
    id bigint GENERATED ALWAYS AS IDENTITY,
    action text NOT NULL,
    object text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'
  );
`;

export default function migrate(db) {
  return db.query(statement);
}
