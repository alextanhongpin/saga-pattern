export default class OrderService {
  constructor(bus, eventStore) {
    this.eventStore = eventStore;
    this.bus = bus;
    // Command handlers.
    this.bus.on("CANCEL_ORDER", this.cancel.bind(this));
    this.bus.on("APPROVE_ORDER", this.approve.bind(this));

    // Event handlers.
    this.bus.on("ORDER_CREATED", this.publish.bind(this));
    this.bus.on("ORDER_CANCELLED", this.publish.bind(this));
    this.bus.on("ORDER_FAILED", this.publish.bind(this));
    this.bus.on("ORDER_APPROVED", this.publish.bind(this));
    this.bus.on("ORDER_REJECTED", this.publish.bind(this));
  }

  onCreate() {
    return true;
  }

  create(data) {
    console.log("creating order");
    const type = this.onCreate() ? "ORDER_CREATED" : "ORDER_FAILED";
    const evt = this.eventStore.create({ type, data });
    this.bus.emit(type, evt);
  }

  cancel(data) {
    console.log("cancelling order");
    const type = "ORDER_CANCELLED";
    const evt = this.eventStore.create({ type, data });
    this.bus.emit(type, evt);
  }

  onApprove() {
    return true;
  }

  approve(data) {
    console.log("approving order");
    const type = this.onApprove() ? "ORDER_APPROVED" : "ORDER_REJECTED";
    const evt = this.eventStore.create({ type, data });
    this.bus.emit(type, evt);
  }

  publish(evt) {
    this.bus.emit("SAGA_REPLY", evt);
    this.eventStore.delete(evt.id);
  }
}
