import express from "express";
import * as uuid from "uuid";
import Redis from "ioredis";

import createDb from "./common/db.js";
import { Producer, Consumer } from "./common/redis.js";

// Services.
import PaymentService from "./payment.js";

const db = await createDb();
const redis = new Redis();

const producer = new Producer({ redis, stream: "saga_reply_stream" });
const consumer = new Consumer({
  redis: redis.duplicate(),
  group: "payment_cg", // cg - consumer group.
  stream: "payment_stream",
  consumer: "node:1"
});
// NOTE: This needs to be created before publishing message.
await consumer.createConsumerGroup();

const paymentService = new PaymentService({ db, consumer, producer });
await paymentService.create({ name: "hello", orderId: uuid.v4() });

const paymentProducer = new Producer({
  redis: redis.duplicate(),
  stream: "payment_stream"
});

await paymentProducer.publish({
  type: "CREATE_PAYMENT",
  payload: {
    name: "john",
    orderId: uuid.v4()
  }
});

const app = express();
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log("listening to port *:%d, press ctrl + c to cancel", port);
});

process.on("SIGTERM", () => {
  console.info("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    redis.flushall();
    redis.quit();
    db.end();
  });
});
