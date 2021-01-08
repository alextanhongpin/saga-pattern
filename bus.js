export default class Bus {
  #events = {};
  on(event, fn) {
    if (!this.#events[event]) {
      this.#events[event] = [];
    }
    this.#events[event].push(fn);
  }
  emit(event, params) {
    const fns = this.#events[event] ?? [];
    for (let fn of fns) {
      fn(params);
    }
  }
}
