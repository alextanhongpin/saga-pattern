import * as uuid from "uuid";
import Redis from "ioredis";

import createApp from "../common/app.js";
import createDb from "../common/db.js";
import { Producer, Consumer } from "../common/redis.js";

// Services.
import Service from "./service.js";

const db = await createDb();
const redis = new Redis();

const producer = new Producer({ redis, stream: "saga_reply_stream" });
const consumer = new Consumer({
  redis,
  group: "delivery_cg", // cg - consumer group.
  stream: "delivery_stream",
  consumer: "node:1"
});
// NOTE: This needs to be created before publishing message.
await consumer.createConsumerGroup();

const service = new Service({ db, consumer, producer });
await service.create({ name: "hello", orderId: uuid.v4() });

createApp();
