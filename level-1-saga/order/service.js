export default class OrderService {
  constructor({ repository, consumer, producer }) {
    this.repository = repository;
    this.consumer = consumer;
    this.producer = producer;

    this.initConsumer();
    this.initProducer();

    this.commandHandlers = {
      APPROVE_ORDER: cmd => this.approve(cmd),
      CREATE_ORDER: cmd => this.create(cmd),
      CANCEL_ORDER: cmd => this.cancel(cmd)
    };
  }

  initConsumer() {
    setInterval(() => {
      this.consumer.consume(cmd => {
        console.log(`[${this.identity}] listenCommand`, cmd);

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

  create({ name }) {
    console.log(`[${this.identity}] createOrder`, { name });

    return this.repository.create({ name });
  }

  cancel({ correlationId: orderId }) {
    console.log(`[${this.identity}] cancelOrder`, { orderId });

    return this.repository.cancel({ orderId });
  }

  approve({ correlationId: orderId }) {
    console.log(`[${this.identity}] approveOrder`, { orderId });

    const approve = true;
    return approve
      ? this.repository.approve({ orderId })
      : this.repository.reject({ orderId });
  }

  get identity() {
    return this.constructor.name;
  }
}
