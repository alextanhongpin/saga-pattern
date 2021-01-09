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
        this.publishCommand("payment", "CREATE_PAYMENT")
      ),
      PAYMENT_CREATED: this.publishCommand("delivery", "CREATE_DELIVERY"),
      DELIVERY_CREATED: this.publishCommand("order", "APPROVE_ORDER"),
      ORDER_APPROVED: evt => this.endSaga(evt),

      // Sad-path...
      ORDER_REJECTED: this.publishCommand("delivery", "CANCEL_DELIVERY"),
      DELIVERY_CANCELLED: this.publishCommand("payment", "CANCEL_PAYMENT"),
      PAYMENT_CANCELLED: this.publishCommand("order", "CANCEL_ORDER"),
      PAYMENT_REJECTED: this.publishCommand("order", "CANCEL_ORDER"),
      ORDER_CANCELLED: evt => this.endSaga(evt)
    };
  }

  async endSaga(payload) {
    const saga = await this.fetchSaga(payload.correlationId);
    const deleted = await this.deleteSaga(saga.id);
    return deleted;
  }

  async initSaga(handler) {
    return async payload => {
      const saga = await this.createSaga(payload.correlationId);
      return handler(payload);
    };
  }

  async eventProcessor(event) {
    console.log(`[${this.identity}]: eventProcessor`, event);
    const { action, data } = event;

    const handler = await this.eventHandlers[action];
    if (!handler) {
      throw new Error(`handler "${action}" not implemented`);
    }

    const { command, streamId } = await handler(event.data);
    await this.updateSaga(event.data.correlationId, {
      event,
      command,
      streamId
    });
  }

  publishCommand(object, action) {
    return async payload => {
      console.log(`[${this.identity}]: handle ${object} command`, {
        action,
        payload
      });
      const command = { action, payload };
      const streamId = await this[object + "Producer"].publish(command);
      return {
        command: { action },
        streamId
      };
    };
  }

  updateSaga(correlationId, data) {
    return this.repository.update({ correlationId, data });
  }

  deleteSaga(id) {
    return this.repository.delete({ id });
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

  get identity() {
    return this.constructor.name;
  }
}
