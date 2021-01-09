import poolEvent from "../common/pool-event.js";

export default class DeliveryService {
  constructor({ db, consumer, producer }) {
    this.db = db;
    this.db.query(`SET search_path TO delivery, public`);

    this.producer = producer;
    this.consumer = consumer;

    this.migrate();

    setInterval(
      () => poolEvent(this.db, evt => this.producer.publish(evt)),
      1000
    );
    setInterval(() => consumer.consume(cmd => this.consume(cmd)), 1000);
  }

  // Receive commands.
  async consume(cmd) {
    try {
      switch (cmd.type) {
        case "CREATE_DELIVERY":
          await this.create(cmd.payload);
          break;
        case "CANCEL_DELIVERY":
          await this.cancel(cmd.payload);
          break;
        default:
          return false;
      }
      // Return true for acknowledgement.
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  async migrate() {
    const result = await this.db.query(`
    CREATE SCHEMA IF NOT EXISTS delivery;
    CREATE TABLE IF NOT EXISTS delivery.entity(
      id uuid DEFAULT gen_random_uuid(),
      name text NOT NULL,
      status text NOT NULL,
      order_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT current_timestamp,
      updated_at timestamptz NOT NULL DEFAULT current_timestamp
    );

    CREATE TABLE IF NOT EXISTS delivery.event (
      id bigint GENERATED ALWAYS AS IDENTITY,
      action text NOT NULL,
      object text NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'
    );`);
    return result.length;
  }

  async create({ name, orderId }) {
    console.log(`[${this.constructor.name}] createDelivery`, { name, orderId });
    const result = await this.db.query(
      `
      WITH delivery_created AS (
        INSERT INTO delivery.entity (name, status, order_id) VALUES ($1, $2, $3)
        RETURNING *
      ), event_inserted AS (
        INSERT INTO delivery.event (action, object, data) 
        VALUES ('delivery_created', 'delivery', (SELECT row_to_json(delivery_created.*) FROM delivery_created))
      )
      SELECT * FROM delivery_created
    `,
      [name, "pending", orderId]
    );
    const delivery = result.rows[0];
    return delivery;
  }

  async cancel({ orderId }) {
    console.log("cancelDelivery", { orderId });
    const result = await this.db.query(
      `
      WITH delivery_cancelled AS (
        UPDATE delivery SET status = 'cancelled'
        WHERE order_id = $1
        RETURNING *
      ), event_inserted AS (
        INSERT INTO delivery.event (action, object, data) 
        VALUES ('delivery_cancelled', 'delivery', (SELECT row_to_json(delivery_cancelled.*) FROM delivery_cancelled))
      )
      SELECT * FROM delivery_cancelled
    `,
      [orderId]
    );

    const delivery = result.rows[0];
    return delivery;
  }
}
