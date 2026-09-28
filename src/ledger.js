'use strict';
// Content addressing + hash-chained ledger with HONEST eviction.
// Ported from SuperInstance/pong-quilt core.js @ b4d15c8 (MOTH-style).
// A bounded ledger that admits it forgets: rows past capacity are evicted and
// the eviction count is exposed, never silently shifted. Head hash chains
// every retained row, so tampering with any row breaks the chain at exactly
// that row on verification.

function hash8(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// Content id — stable across runs for the same weights.
function netId(net) { return hash8(JSON.stringify(net)); }

function makeLedger(capacity) {
  if (!(capacity >= 1)) throw new RangeError("ledger capacity must be >= 1");
  const rows = [];
  let head = "0".repeat(64); // genesis hash, MOTH-compatible length
  let evicted = 0;
  return {
    write(row) {
      const r = Object.assign({}, row, { i: rows.length + evicted, prev: head });
      head = hash8(JSON.stringify(r));
      r.hash = head;
      rows.push(r);
      if (rows.length > capacity) { rows.shift(); evicted++; }
      return r;
    },
    tail(n) { return rows.slice(-n); },
    items() { return rows.slice(); },
    get head() { return head; },
    get size() { return rows.length; },
    get evicted() { return evicted; },
    get capacity() { return capacity; },
  };
}

// Verify a retained slice: walk rows, re-derive each hash from
// (row minus its hash field) chained on prev. Returns the first break.
function verifyLedger(rows) {
  let prev = rows.length && rows[0].prev;
  for (let i = 0; i < rows.length; i++) {
    const { hash, ...rest } = rows[i];
    if (rows[i].prev !== prev) return { ok: false, at: rows[i].i, why: "prev_mismatch" };
    if (hash8(JSON.stringify(rest)) !== hash) return { ok: false, at: rows[i].i, why: "hash_mismatch" };
    prev = hash;
  }
  return { ok: true, rows: rows.length, head: prev };
}

module.exports = { hash8, netId, makeLedger, verifyLedger };
