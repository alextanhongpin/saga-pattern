export default class SagaExecutionCoordinator {
  constructor({
    db,
    // Event Bus.
    consumer,

    // Command Bus.
    paymentProducer,
    orderProducer,
    deliveryProducer
  }) {
    this.db = db;
    this.consumer = consumer;

    this.paymentProducer = paymentProducer;
    this.orderProducer = orderProducer;
    this.deliveryProducer = deliveryProducer;

    setInterval(() => consumer.consume(evt => this.eventProcessor(evt)), 1000);

    // [createOrder (ORDER_CREATED), cancelOrder (ORDER_CANCELLED)]
    // [createPayment (PAYMENT_CREATED, PAYMENT_REJECTED), cancelPayment (PAYMENT_CANCELLED)]
    // [createDelivery (DELIVERY_CREATED), cancelDelivery (DELIVERY_CANCELLED)]
    // [approveOrder (ORDER_APPROVED, ORDER_REJECTED), -]

    this.stateMachine = {
      // Happy-path.
      ORDER_CREATED: this.handlePaymentCommand("CREATE_PAYMENT"),
      PAYMENT_CREATED: this.handleDeliveryCommand("CREATE_DELIVERY"),
      DELIVERY_CREATED: this.handleOrderCommand("APPROVE_ORDER"),
      ORDER_APPROVED: null,

      // Sad-path...
      ORDER_REJECTED: this.handleDeliveryCommand("CANCEL_DELIVERY"),
      DELIVERY_CANCELLED: this.handlePaymentCommand("CANCEL_PAYMENT"),
      PAYMENT_CANCELLED: this.handleOrderCommand("CANCEL_ORDER"),
      PAYMENT_REJECTED: this.handleOrderCommand("CANCEL_ORDER"),
      ORDER_CANCELLED: null
    };

    this.migrate();
  }

  async migrate() {
    const result = await this.db.query(`
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
    `);
    return result;
  }

  async updateSaga(saga, data) {
    console.log(`[${this.identity}]: updateSaga`, { saga, data });
    const result = await this.db.query(
      `
      UPDATE saga_state SET history = array_append(history, $1)
      WHERE id = $2
    `,
      [data, saga.id]
    );
    if (!result.rowCount) throw new Error("saga not updated");
  }

  async endSaga(saga) {
    console.log(`[${this.identity}]: endSaga`, saga);
    await this.db.query(
      `UPDATE saga_state SET deleted_at = current_timestamp WHERE id = $1`,
      [saga.id]
    );
  }

  async initSaga(correlationId, name = "CREATE_ORDER_SAGA") {
    console.log(`[${this.identity}]: initSaga`, { correlationId });
    const result = await this.db.query(
      `
      INSERT INTO saga_state (correlation_id, name) 
      VALUES ($1, $2)
      ON CONFLICT (correlation_id) DO UPDATE SET updated_at = current_timestamp
      RETURNING *
    `,
      [correlationId, name]
    );
    return result.rows[0];
  }

  async fetchSaga(correlationId) {
    console.log(`[${this.identity}]: fetchSaga`, { correlationId });
    const result = await this.db.query(
      `
      SELECT * 
      FROM saga_state 
      WHERE correlation_id = $1
    `,
      [correlationId]
    );
    const saga = result.rows[0];
    if (!saga) throw new Error("saga not found");
    return saga;
  }

  abortSaga() {}

  async eventProcessor({ action, object, data }) {
    console.log(`[${this.identity}]: eventProcessor`, {
      action,
      object,
      data
    });
    try {
      // TODO: Check valid transition for state machine.
      switch (action) {
        case "ORDER_CREATED": {
          const orderId = data.id; // OrderId becomes the correlation id.
          const saga = await this.initSaga(orderId);
          const next = this.stateMachine[action];
          await next({
            orderId,
            ...data
          });
          await this.updateSaga(saga, { action, object, data });
          break;
        }
        case "ORDER_APPROVED":
          const saga = await this.fetchSaga(data.id);
          await this.endSaga(saga);
          break;
        default: {
          const correlationId =
            (action.startsWith("ORDER") ? data.id : data.order_id) ??
            data.orderId;
          const saga = await this.fetchSaga(correlationId);
          const next = this.stateMachine[action];
          if (next) {
            await next({
              orderId: correlationId,
              ...data
            });
          }
          await this.updateSaga(saga, { action, object, data });
          break;
        }
      }
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  handlePaymentCommand(type) {
    return payload => {
      console.log(`[${this.identity}]: handlePaymentCommand`, {
        type,
        payload
      });
      const cmd = {
        type,
        payload
      };
      return this.paymentProducer.publish(cmd);
    };
  }

  handleOrderCommand(type) {
    return payload => {
      console.log(`[${this.identity}]: handleOrderCommand`, { type, payload });
      const cmd = {
        type,
        payload
      };
      return this.orderProducer.publish(cmd);
    };
  }

  handleDeliveryCommand(type) {
    return payload => {
      console.log(`[${this.identity}]: handleDeliveryCommand`, {
        type,
        payload
      });
      const cmd = {
        type,
        payload
      };
      return this.deliveryProducer.publish(cmd);
    };
  }

  get identity() {
    return this.constructor.name;
  }
}
