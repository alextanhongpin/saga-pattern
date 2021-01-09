import isObject from "./object.js";

export default class RedisObject {
  // Transform an object to an array of key-value pairs,
  // e.g. {foo: 'bar'} => ['foo', 'bar']
  // Stringifies object too.
  static toArray(obj) {
    return Object.entries(obj).flatMap(o =>
      o.map(i => (isObject(i) ? JSON.stringify(i) : i))
    );
  }

  // Transform an array of key-value pairs into an object,
  // e.g. ['foo', 'bar', 'hello', 'world'] => {foo: 'bar', 'hello': 'world'}
  static fromArray(arr) {
    const obj = {};
    for (let i = 0; i < arr.length; i += 2) {
      try {
        obj[arr[i]] = JSON.parse(arr[i + 1]);
      } catch (error) {
        obj[arr[i]] = arr[i + 1];
      }
    }
    return obj;
  }
}
