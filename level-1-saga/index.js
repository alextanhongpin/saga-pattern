import Redis from "ioredis";
import createDb from "./common/db.js";
import createApp from "./common/app.js";
import { Producer, Consumer } from "./common/redis.js";
import SagaExecutionCoordinator from "./saga-execution-coordinator.js";

const db = await createDb();
const redis = new Redis();

const consumer = new Consumer({
  redis,
  group: "saga_reply_cg", // cg - consumer group.
  stream: "saga_reply_stream",
  consumer: "node:1"
});
// NOTE: This needs to be created before publishing message.
await consumer.createConsumerGroup();

const sagaExecutionCoordinator = new SagaExecutionCoordinator({
  db,
  consumer,
  paymentProducer: new Producer({ redis, stream: "payment_stream" }),
  orderProducer: new Producer({ redis, stream: "order_stream" }),
  deliveryProducer: new Producer({ redis, stream: "delivery_stream" })
});

createApp();
