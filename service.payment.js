export default class PaymentService {
  constructor(bus, eventStore) {
    this.eventStore = eventStore;
    this.bus = bus;
    // Command handlers.
    this.bus.on("CREATE_PAYMENT", this.create.bind(this));
    this.bus.on("CANCEL_PAYMENT", this.cancel.bind(this));

    // Event handlers.
    this.bus.on("PAYMENT_CREATED", this.publish.bind(this));
    this.bus.on("PAYMENT_FAILED", this.publish.bind(this));
    this.bus.on("PAYMENT_CANCELLED", this.publish.bind(this));
  }

  onCreate() {
    return true;
  }

  create(data) {
    console.log("creating payment");
    const type = this.onCreate() ? "PAYMENT_CREATED" : "PAYMENT_FAILED";
    const evt = this.eventStore.create({ type, data });

    // Outbox Pattern.
    this.bus.emit(type, evt);
  }

  cancel(data) {
    console.log("cancelling payment");
    const type = "PAYMENT_CANCELLED";
    const evt = this.eventStore.create({ type, data });
    this.bus.emit(type, evt);
  }

  publish(evt) {
    this.bus.emit("SAGA_REPLY", evt);
    this.eventStore.delete(evt.id);
  }
}
