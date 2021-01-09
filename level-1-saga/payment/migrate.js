const statement = `
  CREATE SCHEMA IF NOT EXISTS payment;
  CREATE TABLE IF NOT EXISTS payment.entity(
    id uuid DEFAULT gen_random_uuid(),
    name text NOT NULL,
    status text NOT NULL,
    order_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz NOT NULL DEFAULT current_timestamp
  );

  CREATE TABLE IF NOT EXISTS payment.event (
    id bigint GENERATED ALWAYS AS IDENTITY,
    action text NOT NULL,
    object text NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'
  );
`;

export default function migrate(db) {
  return db.query(statement);
}
