export default class SagaExecutionCoordinator {
  constructor({
    repository,

    // Event Bus.
    consumer,

    // Command Bus.
    paymentProducer,
    orderProducer,
    deliveryProducer
  }) {
    this.repository = repository;
    this.consumer = consumer;
    this.paymentProducer = paymentProducer;
    this.orderProducer = orderProducer;
    this.deliveryProducer = deliveryProducer;

    setInterval(() => consumer.consume(evt => this.eventProcessor(evt)), 1000);

    // [createOrder (ORDER_CREATED), cancelOrder (ORDER_CANCELLED)]
    // [createPayment (PAYMENT_CREATED, PAYMENT_REJECTED), cancelPayment (PAYMENT_CANCELLED)]
    // [createDelivery (DELIVERY_CREATED), cancelDelivery (DELIVERY_CANCELLED)]
    // [approveOrder (ORDER_APPROVED, ORDER_REJECTED), -]

    this.eventHandlers = {
      // Happy-path.
      ORDER_CREATED: this.initSaga(
        this.handleCommand("payment", "CREATE_PAYMENT")
      ),
      PAYMENT_CREATED: this.handleCommand("delivery", "CREATE_DELIVERY"),
      DELIVERY_CREATED: this.handleCommand("order", "APPROVE_ORDER"),
      ORDER_APPROVED: this.endSaga.bind(this),

      // Sad-path...
      ORDER_REJECTED: this.handleCommand("delivery", "CANCEL_DELIVERY"),
      DELIVERY_CANCELLED: this.handleCommand("payment", "CANCEL_PAYMENT"),
      PAYMENT_CANCELLED: this.handleCommand("order", "CANCEL_ORDER"),
      PAYMENT_REJECTED: this.handleCommand("order", "CANCEL_ORDER"),
      ORDER_CANCELLED: this.endSaga.bind(this)
    };
  }

  updateSaga(correlationId, data) {
    return this.repository.update({ correlationId, data });
  }

  deleteSaga(id, data) {
    return this.repository.delete({ id, data });
  }

  createSaga(correlationId) {
    return this.repository.create({
      correlationId,
      name: "CREATE_ORDER_SAGA"
    });
  }

  fetchSaga(correlationId) {
    return this.repository.findOneByCorrelationId(correlationId);
  }

  async endSaga(event) {
    const saga = await this.fetchSaga(event.data.correlationId);
    const deleted = await this.deleteSaga(saga.id, { event });
    console.log(deleted);
    return deleted;
  }

  async initSaga(handler) {
    return async event => {
      const saga = await this.createSaga(event.data.correlationId);
      return handler(event);
    };
  }

  async eventProcessor(event) {
    console.log(`[${this.identity}]: eventProcessor`, event);
    const { action, data } = event;

    const handler = await this.eventHandlers[action];
    if (!handler) {
      throw new Error(`handler "${action}" not implemented`);
    }

    const { command, streamId } = await handler(event);
    await this.updateSaga(event.data.correlationId, {
      event,
      command,
      streamId
    });
  }

  handleCommand(object, action) {
    return async payload => {
      console.log(`[${this.identity}]: handle ${object} command`, {
        action,
        payload
      });
      const command = { action, payload };
      const streamId = await this[object + "Producer"].publish(command);
      return {
        command,
        streamId
      };
    };
  }

  get identity() {
    return this.constructor.name;
  }
}
