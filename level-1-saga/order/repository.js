import poolEvent from "../common/pool-event.js";

const CREATE = `
  WITH order_created AS (
    INSERT INTO "order".entity (name, status) 
    VALUES ($1, $2)
    RETURNING *
  ), event_inserted AS (
    INSERT INTO "order".event (action, object, data) 
    VALUES ('ORDER_CREATED', 'order', (
      SELECT row_to_json(order_created.*)::jsonb || json_build_object('correlationId', order_created.id)::jsonb
      FROM order_created
    ))
  )
  SELECT * 
  FROM order_created
`;

const CANCEL = `
  WITH order_cancelled AS (
    UPDATE "order".entity 
    SET status = 'cancelled'
    WHERE id = $1
    RETURNING *
  ), event_inserted AS (
    INSERT INTO "order".event (action, object, data) 
    VALUES ('ORDER_CANCELLED', 'order', (
      SELECT row_to_json(order_cancelled.*)::jsonb || json_build_object('correlationId', order_cancelled.id)::jsonb
      FROM order_cancelled
    ))
  )
  SELECT * 
  FROM order_cancelled
`;

const APPROVE = `
  WITH order_approved AS (
    UPDATE "order".entity 
    SET status = 'approved'
    WHERE id = $1
    RETURNING *
  ), event_inserted AS (
    INSERT INTO "order".event (action, object, data) 
    VALUES ('ORDER_APPROVED', 'order', (
      SELECT row_to_json(order_approved.*)::jsonb || json_build_object('correlationId', order_approved.id)::jsonb
      FROM order_approved
    ))
  )
  SELECT * 
  FROM order_approved
`;

const REJECT = `
  WITH order_rejected AS (
    UPDATE "order".entity 
    SET status = 'rejected'
    WHERE id = $1
    RETURNING *
  ), event_inserted AS (
    INSERT INTO "order".event (action, object, data) 
    VALUES ('ORDER_REJECTED', 'order', (
      SELECT row_to_json(order_rejected.*)::jsonb || json_build_object('correlationId', order_rejected.id)::jsonb 
      FROM order_rejected
    ))
  )
  SELECT * 
  FROM order_rejected
`;

export default class OrderRepository {
  constructor(db) {
    this.db = db;
    this.db.query('SET search_path TO "order", public');
  }

  async create({ name }) {
    const values = [name, "pending"];
    const result = await this.db.query(CREATE, values);
    return result.rows[0];
  }

  async cancel({ orderId }) {
    const values = [orderId];
    const result = await this.db.query(CANCEL, values);
    return result.rows[0];
  }

  async approve({ orderId }) {
    const values = [orderId];
    const result = await this.db.query(APPROVE, values);
    return result.rows[0];
  }

  async reject({ orderId }) {
    const values = [orderId];
    const result = await this.db.query(REJECT, values);
    return result.rows[0];
  }

  pool(fn) {
    return poolEvent(this.db, fn);
  }
}
