import poolEvent from "../common/pool-event.js";

export default class OrderService {
  constructor({ db, consumer, producer }) {
    this.db = db;
    this.db.query(`SET search_path TO "order", public`);

    this.producer = producer;
    this.consumer = consumer;

    this.migrate();

    setInterval(
      () =>
        poolEvent(this.db, evt => {
          console.log(`[${this.identity}] publishEvent`, evt);
          this.producer.publish(evt);
        }),
      1000
    );
    setInterval(() => consumer.consume(cmd => this.consume(cmd)), 1000);
  }

  // Receive commands.
  async consume(cmd) {
    console.log(`[${this.identity}] consume`, cmd);
    try {
      switch (cmd.type) {
        case "APPROVE_ORDER":
          await this.approve(cmd.payload);
          break;
        case "CREATE_ORDER":
          await this.create(cmd.payload);
          break;
        case "CANCEL_ORDER":
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
    );`);
    return result.length;
  }

  async create({ name, orderId }) {
    console.log(`[${this.identity}] createOrder`, { name, orderId });
    const result = await this.db.query(
      `
      WITH order_created AS (
        INSERT INTO "order".entity (name, status) 
        VALUES ($1, $2)
        RETURNING *
      ), event_inserted AS (
        INSERT INTO "order".event (action, object, data) 
        VALUES ('ORDER_CREATED', 'order', (SELECT row_to_json(order_created.*) FROM order_created))
      )
      SELECT * FROM order_created
    `,
      [name, "pending"]
    );
    const order = result.rows[0];
    return order;
  }

  async cancel({ orderId }) {
    console.log(`[${this.identity}] cancelOrder`, { orderId });
    const result = await this.db.query(
      `
      WITH order_cancelled AS (
        UPDATE "order".entity SET status = 'cancelled'
        WHERE id = $1
        RETURNING *
      ), event_inserted AS (
        INSERT INTO "order".event (action, object, data) 
        VALUES ('ORDER_CANCELLED', 'order', (SELECT row_to_json(order_cancelled.*) FROM order_cancelled))
      )
      SELECT * FROM order_cancelled
    `,
      [orderId]
    );

    const order = result.rows[0];
    return order;
  }

  async approve({ orderId }) {
    console.log(`[${this.identity}] approveOrder`, { orderId });
    const approve = true;
    if (approve) {
      const result = await this.db.query(
        `
      WITH order_approved AS (
        UPDATE "order".entity SET status = 'approved'
        WHERE id = $1
        RETURNING *
      ), event_inserted AS (
        INSERT INTO "order".event (action, object, data) 
        VALUES ('ORDER_APPROVED', 'order', (SELECT row_to_json(order_approved.*) FROM order_approved))
      )
      SELECT * FROM order_approved
    `,
        [orderId]
      );

      const order = result.rows[0];
      return order;
    } else {
      const result = await this.db.query(
        `
      WITH order_rejected AS (
        UPDATE "order".entity SET status = 'rejected'
        WHERE id = $1
        RETURNING *
      ), event_inserted AS (
        INSERT INTO "order".event (action, object, data) 
        VALUES ('ORDER_REJECTED', 'order', (SELECT row_to_json(order_rejected.*) FROM order_rejected))
      )
      SELECT * FROM order_rejected
    `,
        [orderId]
      );

      const order = result.rows[0];
      return order;
    }
  }

  get identity() {
    return this.constructor.name;
  }
}
