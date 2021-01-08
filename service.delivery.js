export default class DeliveryService {
  constructor(bus, eventStore) {
    this.eventStore = eventStore;
    this.bus = bus;

    // Command handlers.
    this.bus.on("CREATE_DELIVERY", this.create.bind(this));
    this.bus.on("CANCEL_DELIVERY", this.cancel.bind(this));

    // Event handlers.
    this.bus.on("DELIVERY_CANCELLED", this.publish.bind(this));
    this.bus.on("DELIVERY_FAILED", this.publish.bind(this));
    this.bus.on("DELIVERY_CREATED", this.publish.bind(this));
  }

  onCreate() {
    return true;
  }

  create(data) {
    console.log("creating delivery");
    const type = this.onCreate() ? "DELIVERY_CREATED" : "DELIVERY_FAILED";

    // Outbox Pattern.
    const evt = this.eventStore.create({ type, data });
    this.bus.emit(type, evt);
  }

  cancel(data) {
    console.log("cancelling delivery");
    const type = "DELIVERY_CANCELLED";
    const evt = this.eventStore.create({ type, data });
    this.bus.emit(type, evt);
  }

  publish(evt) {
    this.bus.emit("SAGA_REPLY", evt);
    this.eventStore.delete(evt.id);
  }
}
