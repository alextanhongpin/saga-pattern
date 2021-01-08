
import { generateId } from "./id.js";

export default class EventStore extends Map {
  create(data) {
    const event = {
      id: generateId(),
      ...data
    };
    this.set(event.id, event);
    return event;
  }
}

