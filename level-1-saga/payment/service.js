import poolEvent from "../common/pool-event.js";

export default class PaymentService {
  constructor({ db, consumer, producer }) {
    this.db = db;
    this.db.query(`SET search_path TO payment, public`);

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
        case "CREATE_PAYMENT":
          await this.create(cmd.payload);
          break;
        case "CANCEL_PAYMENT":
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
    );`);
    return result.length;
  }

  async create({ name, orderId }) {
    console.log(`[${this.constructor.name}] createPayment`, { name, orderId });
    const result = await this.db.query(
      `
      WITH payment_created AS (
        INSERT INTO payment.entity (name, status, order_id) VALUES ($1, $2, $3)
        RETURNING *
      ), event_inserted AS (
        INSERT INTO payment.event (action, object, data) 
        VALUES ('payment_created', 'payment', (SELECT row_to_json(payment_created.*) FROM payment_created))
      )
      SELECT * FROM payment_created
    `,
      [name, "pending", orderId]
    );
    const payment = result.rows[0];
    return payment;
  }

  async cancel({ orderId }) {
    console.log("cancelPayment", { orderId });
    const result = await this.db.query(
      `
      UPDATE payment SET status = 'cancelled'
      WHERE order_id = $1
      RETURNING *
    `,
      [orderId]
    );

    const payment = result.rows[0];
    return payment;
  }
}
