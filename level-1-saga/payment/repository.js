import poolEvent from "../common/pool-event.js";

const CREATE = `
  WITH payment_created AS (
    INSERT INTO payment.entity (name, status, order_id) 
    VALUES ($1, $2, $3)
    RETURNING *
  ), event_inserted AS (
    INSERT INTO payment.event (action, object, data) 
    VALUES ('PAYMENT_CREATED', 'payment', (
      SELECT row_to_json(payment_created.*)::jsonb || json_build_object('correlationId', payment_created.order_id)::jsonb
      FROM payment_created
    ))
  )
  SELECT * 
  FROM payment_created
`;

const CANCEL = `
  WITH payment_cancelled AS (
    UPDATE payment.entity 
    SET status = 'refunded'
    WHERE order_id = $1
    RETURNING *
  ), event_inserted AS (
    INSERT INTO payment.event (action, object, data) 
    VALUES ('PAYMENT_CANCELLED', 'payment', (
      SELECT row_to_json(payment_cancelled.*)::jsonb || json_build_object('correlationId', payment_cancelled.order_id)::jsonb
      FROM payment_cancelled
    ))
  )
  SELECT * 
  FROM payment_cancelled
`;

export default class PaymentRepository {
  constructor(db) {
    this.db = db;
    this.db.query(`SET search_path TO payment, public`);
  }

  async create({ name, orderId }) {
    const values = [name, "pending", orderId];
    const result = await this.db.query(CREATE, values);
    return result.rows[0];
  }

  async cancel({ orderId }) {
    const values = [orderId];
    const result = await this.db.query(CANCEL, values);
    return result.rows[0];
  }

  pool(fn) {
    return poolEvent(this.db, fn);
  }
}
