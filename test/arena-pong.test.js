'use strict';
// Reference-arena pins: the ported pong game keeps its source semantics —
// determinism, outcome classification, and the escalation law that makes even
// a perfect oracle eventually die (R50).

const test = require("node:test");
const assert = require("node:assert/strict");

const arena = require("../arenas/pong");
const { rng } = require("../src/rng");
const { netId } = require("../src/ledger");

test("pong arena: compete is deterministic given the rand stream", () => {
  const r1 = rng(20260924), r2 = rng(20260924);
  const a = arena.makeNet(r1), b = arena.makeNet(r1);
  const c1 = arena.compete(a, b, rng(1), { maxFrames: 800 });
  const c2 = arena.compete(a, b, rng(1), { maxFrames: 800 });
  assert.deepEqual(c1, c2);
});

test("pong arena: outcome vocabulary is A-WINS (cap) or B-WINS (kill)", () => {
  const rand = rng(20260924);
  const a = arena.makeNet(rand), b = arena.makeNet(rand);
  const r = arena.compete(a, b, rng(2), { maxFrames: 500 });
  assert.match(r.outcome, /A-WINS|B-WINS/);
  if (r.outcome === "A-WINS") assert.equal(r.frames, 500);
});

test("pong arena: fresh nets usually die young — evolution has signal to climb", () => {
  const rand = rng(20260924);
  let deaths = 0, n = 12;
  for (let i = 0; i < n; i++) {
    const a = arena.makeNet(rand), b = arena.makeNet(rand);
    const r = arena.compete(a, b, rand, { maxFrames: 1200 });
    if (r.outcome === "B-WINS") deaths++;
  }
  assert.ok(deaths >= n * 0.5, `expected mostly early deaths, got ${deaths}/${n}`);
});

test("pong arena: a short tournament produces a verifiable ledger", () => {
  const { runTournament } = require("../src/engine");
  const { verifyLedger } = require("../src/ledger");
  const { aChamp, bChamp, ledger } = runTournament({ arena, seed: 41, pop: 10, gens: 5,
    elites: 3, maxFrames: 900 });
  assert.equal(verifyLedger(ledger.items()).ok, true);
  assert.ok(netId(aChamp.net));
  assert.ok(netId(bChamp.net));
  assert.equal(ledger.items().length, 6);
});
