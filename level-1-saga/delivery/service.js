import poolEvent from "../common/pool-event.js";

export default class DeliveryService {
  constructor({ repository, consumer, producer }) {
    this.repository = repository;
    this.consumer = consumer;
    this.producer = producer;

    this.initConsumer();
    this.initProducer();

    this.commandHandlers = {
      CREATE_DELIVERY: cmd => this.create(cmd),
      CANCEL_DELIVERY: cmd => this.cancel(cmd)
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

  create({ name, correlationId: orderId }) {
    console.log(`[${this.identity}] createDelivery`, { name, orderId });

    return this.repository.create({ name, orderId });
  }

  cancel({ correlationId: orderId }) {
    console.log(`[${this.identity}] cancelDelivery`, { orderId });

    return this.repository.cancel({ orderId });
  }

  get identity() {
    return this.constructor.name;
  }
}
