'use strict';
// Pins. Methodology inherited from pong-quilt: every behavior claim below was
// proven FAIL-first against the module under test where it guards real
// semantics (the FAIL-first note per file names what was red before green).

const test = require("node:test");
const assert = require("node:assert/strict");

const { rng } = require("../src/rng");
const { makeRing } = require("../src/ring");
const { makeEvaluator } = require("../src/evaluator");
const { hash8, netId, makeLedger, verifyLedger } = require("../src/ledger");

test("rng: same seed -> same stream, different seeds -> different", () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) { assert.ok(v >= 0 && v < 1); }
});

test("rng: seed 0 is a real seed, not falsy-collapsed", () => {
  const z = rng(0), d = rng(1);
  const sz = [z(), z()], sd = [d(), d()];
  assert.ok(sz.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(sz, sd);
});

test("ring: bounded FIFO, oldest evicted, monotonic writes", () => {
  const r = makeRing(3);
  for (const v of [1, 2, 3, 4, 5]) r.write(v);
  assert.equal(r.size, 3);
  assert.equal(r.writes, 5);
  assert.deepEqual(r.items(), [3, 4, 5]);
  assert.deepEqual(r.tail(2), [4, 5]);
  assert.deepEqual(r.tail(99), [3, 4, 5]);
});

test("ring: capacity must be >= 1", () => {
  assert.throws(() => makeRing(0), RangeError);
});

test("evaluator: streaming elites equal brute-force top-K", () => {
  const cands = Array.from({ length: 50 }, (_, i) => ({ i }));
  const fitness = (c) => ((c.i * 7919) % 101); // deterministic pseudo-fitness
  const ev = makeEvaluator(cands, (c) => ({ fitness: fitness(c) }), { eliteK: 5 });
  while (!ev.done) ev.step(7); // odd batch sizes, spread across steps
  const brute = cands.map((c) => ({ c, f: fitness(c) })).sort((a, b) => b.f - a.f).slice(0, 5);
  assert.deepEqual(ev.step(1).elites.map((e) => e.fitness), brute.map((b) => b.f));
});

test("evaluator: default tie keeps incumbent (strict >), onTie seam can override", () => {
  const ev = makeEvaluator([1, 2], () => ({ fitness: 5 }), { eliteK: 1 });
  const s = ev.step(2);
  assert.equal(s.best.index, 0); // index-order bias preserved as the documented default
  const flips = [];
  const ev2 = makeEvaluator([1, 2], () => ({ fitness: 5 }),
    { eliteK: 1, onTie: (rec) => { flips.push(rec.index); return true; } });
  ev2.step(2);
  assert.deepEqual(flips, [1]); // challenger consulted; seam wired
});

test("ledger: hash chain verifies, tamper caught at exact row", () => {
  const l = makeLedger(10);
  l.write({ a: 1 }); l.write({ a: 2 }); l.write({ a: 3 });
  const rows = l.items();
  assert.equal(verifyLedger(rows).ok, true);
  rows[1].a = 999; // post-write tamper
  const v = verifyLedger(rows);
  assert.equal(v.ok, false);
  assert.equal(v.at, 1);
  assert.equal(v.why, "hash_mismatch");
});

test("ledger: honest eviction count — a bounded ledger admits it forgets", () => {
  const l = makeLedger(2);
  l.write({ x: 1 }); l.write({ x: 2 }); l.write({ x: 3 }); l.write({ x: 4 });
  assert.equal(l.size, 2);
  assert.equal(l.evicted, 2);
  const rows = l.items();
  assert.equal(rows[0].i, 2); // global indices survive eviction
  assert.equal(verifyLedger(rows).ok, true);
});

test("netId: content id stable across runs for the same weights", () => {
  const r = rng(9);
  const base = { w: [r(), r()], b: [r()] };
  const n1 = base;
  const n2 = JSON.parse(JSON.stringify(base)); // same weights, different object
  assert.equal(netId(n1), netId(n2));
  assert.equal(netId(n1).length, 8);
  assert.notEqual(netId(n1), netId({ w: [0.5], b: [] }));
});

test("hash8: stable, 8 hex chars", () => {
  assert.equal(hash8("abc"), hash8("abc"));
  assert.match(hash8("abc"), /^[0-9a-f]{8}$/);
});
