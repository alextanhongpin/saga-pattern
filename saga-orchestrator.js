import { generateId } from "./id.js";

class OrderSaga {
  constructor(id) {
    this.id = id;
  }
}

export default class SagaOrchestrator {
  constructor(bus) {
    this.sagas = new Map();
    this.bus = bus;
    this.bus.on("SAGA_REPLY", this.reply.bind(this));
    // Visualization:
    // [createOrder, cancelOrder]
    // [createPayment, cancelPayment]
    // [createDelivery, cancelDelivery]
    // [approveOrder, -]
    this.stateMachine = {
      DELIVERY_CREATED: this.approveOrder.bind(this),
      DELIVERY_FAILED: this.cancelPayment.bind(this),
      DELIVERY_CANCELLED: this.cancelPayment.bind(this),
      PAYMENT_CREATED: this.createDelivery.bind(this),
      PAYMENT_FAILED: this.cancelOrder.bind(this),
      PAYMENT_CANCELLED: this.cancelOrder.bind(this),
      ORDER_CREATED: this.createPayment.bind(this),
      ORDER_REJECTED: this.cancelDelivery.bind(this),
      ORDER_APPROVED: this.endSaga.bind(this),
      ORDER_CANCELLED: this.endSaga.bind(this)
    };
  }

  reply(evt) {
    console.log("> SAGA_REPLY:", evt.type);
    let saga;
    switch (evt.type) {
      case "ORDER_CREATED": {
        // Init saga.
        const correlationId = generateId();
        saga = new OrderSaga(correlationId);
        this.sagas.set(saga.id, saga);
        break;
      }
      default:
        const correlationId = evt.data.correlationId;
        saga = this.sagas.get(correlationId);
    }
    const task = this.stateMachine[evt.type];
    task(saga);
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
    this.sagas.delete(saga.id);
    console.log(this.sagas);
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
