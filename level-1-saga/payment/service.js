export default class PaymentService {
  constructor({ repository, consumer, producer }) {
    this.repository = repository;
    this.consumer = consumer;
    this.producer = producer;

    this.initConsumer();
    this.initProducer();

    this.commandHandlers = {
      CREATE_PAYMENT: cmd => this.create(cmd),
      CANCEL_PAYMENT: cmd => this.cancel(cmd)
    };
  }

  initConsumer() {
    setInterval(() => {
      this.consumer.consume(cmd => {
        console.log(`[${this.identity}] consume`, cmd);

        return this.commandProcessor(cmd);
      });
    }, 1000);
  }

  initProducer() {
    setInterval(() => {
      this.repository.pool(evt => {
        console.log(`[${this.identity}] publishEvent`, evt);

        return this.producer.publish(evt);
      });
    }, 1000);
  }

  commandProcessor(cmd) {
    const handler = this.commandHandlers[cmd.action];
    if (!handler) {
      throw new Error(`command "${cmd.action}" not implemented`);
    }
    return handler(cmd.payload);
  }

  create({ name, correlationId: orderId }) {
    console.log(`[${this.identity}] createPayment`, { name, orderId });

    return this.repository.create({ name, orderId });
  }

  cancel({ correlationId: orderId }) {
    console.log(`[${this.identity}] cancelPayment`, { orderId });

    return this.repository.cancel({ orderId });
  }

  get identity() {
    return this.constructor.name;
  }
}
