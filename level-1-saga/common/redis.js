import RedisObject from "./redis-object.js";

const STREAM_LEN = ["MAXLEN", "~", 1_000_000];
const AUTO_GENERATE_ID = "*";

export class Producer {
  constructor({ redis, stream }) {
    this.redis = redis;
    this.stream = stream;
  }

  async publish(payload) {
    const redisId = await this.redis.xadd(
      this.stream,
      ...STREAM_LEN,
      AUTO_GENERATE_ID,
      ...RedisObject.toArray(payload)
    );
    return redisId;
  }
}

export class Consumer {
  #checkBacklog = true;

  constructor({ redis, group, stream, consumer }) {
    this.redis = redis;
    this.group = group;
    this.stream = stream;
    this.consumer = consumer;
  }

  async createConsumerGroup() {
    try {
      await this.redis.xgroup(
        "CREATE",
        this.stream,
        this.group,
        "$",
        "MKSTREAM"
      );
    } catch (error) {
      if (error.message.startsWith("BUSYGROUP")) {
        console.log("consumer exists");
        return;
      }
      throw error;
    }
  }

  async consume(asyncBoolFn) {
    let startId = this.#checkBacklog ? 0 : ">";
    const streams = await this.redis.xreadgroup(
      "GROUP",
      this.group,
      this.consumer,
      "COUNT",
      10,
      "STREAMS",
      this.stream,
      startId
    );
    if (!streams) return false;

    const [streamName, records] = streams[0];
    this.#checkBacklog = !(records.length === 0);

    for await (let record of records) {
      const [redisId, fields] = record;
      const event = RedisObject.fromArray(fields);

      const ack = await asyncBoolFn(event);

      ack && (await this.redis.xack(this.stream, this.group, redisId));
    }
    return true;
  }
}
