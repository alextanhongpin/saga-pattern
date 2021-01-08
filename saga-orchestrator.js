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
    this.stateMachine = {
      // Delivery.
      DELIVERY_CREATED: this.approveOrder.bind(this),
      DELIVERY_FAILED: this.cancelPayment.bind(this),
      DELIVERY_CANCELLED: this.cancelPayment.bind(this),

      // Payment.
      PAYMENT_CREATED: this.createDelivery.bind(this),
      PAYMENT_FAILED: this.cancelOrder.bind(this),
      PAYMENT_CANCELLED: this.cancelOrder.bind(this),

      // Order.
      ORDER_CREATED: this.createPayment.bind(this),
      ORDER_REJECTED: this.cancelDelivery.bind(this),
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

  createPayment(saga) {
    const cmd = {
      type: "CREATE_PAYMENT",
      correlationId: saga.id
    };
    this.bus.emit(cmd.type, cmd);
  }

  createDelivery(saga) {
    const cmd = {
      type: "CREATE_DELIVERY",
      correlationId: saga.id
    };
    this.bus.emit(cmd.type, cmd);
  }

  approveOrder(saga) {
    const cmd = {
      type: "APPROVE_ORDER",
      correlationId: saga.id
    };
    this.bus.emit(cmd.type, cmd);
  }

  endSaga(saga) {
    console.log(this.sagas);
    this.sagas.delete(saga.id);
  }

  cancelOrder(saga) {
    const cmd = {
      type: "CANCEL_ORDER",
      correlationId: saga.id
    };
    this.bus.emit(cmd.type, cmd);
  }

  cancelPayment(saga) {
    const cmd = {
      type: "CANCEL_PAYMENT",
      correlationId: saga.id
    };
    this.bus.emit(cmd.type, cmd);
  }

  cancelDelivery(saga) {
    const cmd = {
      type: "CANCEL_DELIVERY",
      correlationId: saga.id
    };
    this.bus.emit(cmd.type, cmd);
  }
}
