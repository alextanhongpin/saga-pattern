import poolEvent from "../common/pool-event.js";

const CREATE = `
  WITH delivery_created AS (
    INSERT INTO delivery.entity (name, status, order_id) 
    VALUES ($1, $2, $3)
    RETURNING *
  ), event_inserted AS (
    INSERT INTO delivery.event (action, object, data) 
    VALUES ('DELIVERY_CREATED', 'delivery', (
      SELECT row_to_json(delivery_created.*)::jsonb || json_build_object('correlationId', delivery_created.order_id)::jsonb
      FROM delivery_created
    ))
  )
  SELECT * 
  FROM delivery_created
`;

const CANCEL = `
  WITH delivery_cancelled AS (
    UPDATE delivery.entity 
    SET status = 'cancelled'
    WHERE order_id = $1
    RETURNING *
  ), event_inserted AS (
    INSERT INTO delivery.event (action, object, data) 
    VALUES ('DELIVERY_CANCELLED', 'delivery', (
      SELECT row_to_json(delivery_cancelled.*)::jsonb || json_build_object('correlationId', delivery_cancelled.order_id)::jsonb
      FROM delivery_cancelled
    ))
  )
  SELECT * 
  FROM delivery_cancelled
`;

export default class DeliveryRepository {
  constructor(db) {
    this.db = db;
    this.db.query(`SET search_path TO delivery, public`);
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
