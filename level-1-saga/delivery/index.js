import Redis from "ioredis";

import createApp from "../common/app.js";
import createDb from "../common/db.js";
import { Producer, Consumer } from "../common/redis.js";

import migrate from "./migrate.js";
import Repository from "./repository.js";
import Service from "./service.js";

const db = await createDb();
await migrate(db);

const redis = new Redis();

const producer = new Producer({ redis, stream: "saga_reply_stream" });
const consumer = new Consumer({
  redis,
  group: "delivery_cg", // cg - consumer group.
  stream: "delivery_stream",
  consumer: "node:1"
});

const repository = new Repository(db);
const service = new Service({ repository, consumer, producer });

createApp();
