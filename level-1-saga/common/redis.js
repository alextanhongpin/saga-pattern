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

function checkConsumerGroupExistence(error) {
  // Consumer already exists.
  if (error.message.startsWith("BUSYGROUP")) {
    return;
  }
  throw error;
}

export class Consumer {
  #checkBacklog = true;
  #consumerGroupCreated = false;

  constructor({ redis, group, stream, consumer }) {
    this.redis = redis;
    this.group = group;
    this.stream = stream;
    this.consumer = consumer;

    this.ensureConsumerGroupCreated();
  }

  async ensureConsumerGroupCreated() {
    if (this.#consumerGroupCreated) return;
    try {
      this.#consumerGroupCreated = await this.redis.xgroup(
        "CREATE",
        this.stream,
        this.group,
        // NOTE: Means listening to all records, including those historical
        // ones. If we set to `$` instead, it will only listen to new ones.
        // However, if we register the consumer after a record has been
        // streamed, we will not get them. This is important when coordinating
        // between different services - we do not want to depend on the
        // sequence of creation of the consumer group.
        "0",
        "MKSTREAM"
      );
    } catch (error) {
      checkConsumerGroupExistence(error);
    }
  }

  async consume(asyncTask, limit = 10) {
    let startId = this.#checkBacklog ? "0" : ">";
    const streams = await this.redis.xreadgroup(
      "GROUP",
      this.group,
      this.consumer,
      "COUNT",
      limit,
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

      try {
        await asyncTask(event);
        await this.redis.xack(this.stream, this.group, redisId);
      } catch (error) {
        throw error;
      }
    }
    return true;
  }
}
