'use strict';
// Bounded FIFO champion history. Ported from SuperInstance/pong-quilt core.js
// @ b4d15c8, which ported it from SuperInstance/quilt-edge-ml ring_buffer.py
// (minus the disk layer): newest kept, oldest evicted on overflow, one slot
// per generation, monotonic write counter — a ring that admits it forgets.

function makeRing(capacity) {
  if (!(capacity >= 1)) throw new RangeError("ring capacity must be >= 1");
  const buf = new Array(capacity);
  let head = 0, count = 0, writes = 0;
  return {
    write(rec) {
      buf[(head + count) % capacity] = rec;
      if (count < capacity) count++;
      else head = (head + 1) % capacity;
      return ++writes;
    },
    tail(n) {
      const k = Math.min(n, count), out = new Array(k);
      for (let i = 0; i < k; i++) out[i] = buf[(head + count - k + i) % capacity];
      return out;
    },
    items() { return this.tail(count); },
    get size() { return count; },
    get writes() { return writes; },
    get capacity() { return capacity; },
  };
}

module.exports = { makeRing };
