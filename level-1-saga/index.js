import Redis from "ioredis";
import createDb from "./common/db.js";
import createApp from "./common/app.js";
import { Producer, Consumer } from "./common/redis.js";

import migrate from "./saga/migrate.js";
import Repository from "./saga/repository.js";
import SagaExecutionCoordinator from "./saga/service.js";

const db = await createDb();
await migrate(db);

const redis = new Redis();

const consumer = new Consumer({
  redis,
  group: "saga_reply_cg", // cg - consumer group.
  stream: "saga_reply_stream",
  consumer: "node:1"
});

const repository = new Repository(db);
const sagaExecutionCoordinator = new SagaExecutionCoordinator({
  repository,
  consumer,
  paymentProducer: new Producer({ redis, stream: "payment_stream" }),
  orderProducer: new Producer({ redis, stream: "order_stream" }),
  deliveryProducer: new Producer({ redis, stream: "delivery_stream" })
});

createApp();
