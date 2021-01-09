import Bus from "./bus.js";
import EventStore from "./event-store.js";
import PaymentService from "./service.payment.js";
import OrderService from "./service.order.js";
import DeliveryService from "./service.delivery.js";
import SagaOrchestrator from "./saga-orchestrator.js";

const eventStore = new EventStore();
const bus = new Bus();
const orderService = new OrderService(bus, eventStore);
const paymentService = new PaymentService(bus, eventStore);
const deliveryService = new DeliveryService(bus, eventStore);
const sagaOrchestrator = new SagaOrchestrator(bus);

console.log("first");

orderService.onCreate = () => true;
paymentService.onCreate = () => true;
deliveryService.onCreate = () => true;
orderService.onApprove = () => true;

orderService.create({ order: "car" });

console.log();
console.log("second");

orderService.onCreate = () => true;
paymentService.onCreate = () => false;
deliveryService.onCreate = () => true;
orderService.onApprove = () => true;

orderService.create({ order: "car" });

console.log();
console.log("third");

orderService.onCreate = () => true;
paymentService.onCreate = () => true;
deliveryService.onCreate = () => false;
orderService.onApprove = () => true;

orderService.create({ order: "car" });

console.log();
console.log("fourth");

orderService.onCreate = () => true;
paymentService.onCreate = () => true;
deliveryService.onCreate = () => true;
orderService.onApprove = () => false;

orderService.create({ order: "car" });
