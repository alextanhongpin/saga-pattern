import { generateId } from "./id.js";

class OrderSaga {
  constructor(id) {
    this.id = id;
    this.events = [];
  }
}

export default class SagaOrchestrator {
  constructor(bus) {
    this.sagas = new Map();
    this.bus = bus;
    this.bus.on("SAGA_REPLY", this.reply.bind(this));
    // Visualization:
    // [createOrder (ORDER_CREATED, ORDER_FAILED), cancelOrder (ORDER_CANCELLED)]
    // [createPayment (PAYMENT_CREATED, PAYMENT_FAILED), cancelPayment (PAYMENT_CANCELLED)]
    // [createDelivery (DELIVERY_CREATED, DELIVERY_FAILED), cancelDelivery (DELIVERY_CANCELLED)]
    // [approveOrder (ORDER_APPROVED, ORDER_REJECTED), -]

    // Maps the event to command handlers.
    this.stateMachine = {
      // Delivery.
      DELIVERY_CREATED: this.handle("APPROVE_ORDER"),
      DELIVERY_FAILED: this.handle("CANCEL_PAYMENT"),
      DELIVERY_CANCELLED: this.handle("CANCEL_PAYMENT"),

      // Payment.
      PAYMENT_CREATED: this.handle("CREATE_DELIVERY"),
      PAYMENT_FAILED: this.handle("CANCEL_ORDER"),
      PAYMENT_CANCELLED: this.handle("CANCEL_ORDER"),

      // Order.
      ORDER_CREATED: this.handle("CREATE_PAYMENT"),
      ORDER_REJECTED: this.handle("CANCEL_DELIVERY"),
      ORDER_APPROVED: this.endSaga.bind(this),
      ORDER_CANCELLED: this.endSaga.bind(this),
      ORDER_FAILED: this.endSaga.bind(this)
    };
  }

  reply(evt) {
    console.log("> SAGA_REPLY:", evt.type);
    let saga;
    switch (evt.type) {
      case "ORDER_CREATED":
        // Init saga.
        const correlationId = generateId();
        saga = new OrderSaga(correlationId);
        saga.events.push(evt.type);
        this.sagas.set(saga.id, saga);
        break;
      default:
        saga = this.sagas.get(evt.data.correlationId);
        saga.events.push(evt.type);
        this.sagas.set(saga.id, saga);
        break;
    }
    const task = this.stateMachine[evt.type];
    task(saga);

    // TODO: Acknowledge event.
  }

  // Event handlers triggers the command handlers.
  handle(type) {
    return saga => {
      const cmd = { type, correlationId: saga.id };
      this.bus.emit(cmd.type, cmd);
    };
  }

  endSaga(saga) {
    console.log(this.sagas);
    this.sagas.delete(saga.id);
  }
}
