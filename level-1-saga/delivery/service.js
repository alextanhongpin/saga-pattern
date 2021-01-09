import poolEvent from "../common/pool-event.js";

export default class DeliveryService {
  constructor({ repository, consumer, producer }) {
    this.repository = repository;
    this.consumer = consumer;
    this.producer = producer;

    this.initConsumer();
    this.initProducer();

    this.commandHandlers = {
      CREATE_DELIVERY: this.create.bind(this),
      CANCEL_DELIVERY: this.cancel.bind(this)
    };
  }

  initConsumer() {
    setInterval(() => {
      this.consumer.consume(cmd => {
        console.log(`[${this.identity}] listenCommand`, cmd);
        this.commandProcessor(cmd);
      });
    }, 1000);
  }

  initProducer() {
    setInterval(() => {
      this.repository.pool(evt => {
        console.log(`[${this.identity}] publishEvent`, evt);
        this.producer.publish(evt);
      });
    }, 1000);
  }

  commandProcessor(cmd) {
    const handler = this.commandHandlers[cmd.action];
    if (!handler) {
      throw new Error(`command "${cmd.action}" not implemented`);
    }
    return handler(cmd.payload.data);
  }

  async create({ name, correlationId: orderId }) {
    console.log(`[${this.identity}] createDelivery`, { name, orderId });

    const delivery = await this.repository.create({ name, orderId });
    return delivery;
  }

  async cancel({ correlationId: orderId }) {
    console.log(`[${this.identity}] cancelDelivery`, { orderId });

    const delivery = await this.repository.cancel({ orderId });
    return delivery;
  }

  get identity() {
    return this.constructor.name;
  }
}
