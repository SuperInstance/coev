'use strict';
// Engine pins: determinism (the property the auditor depends on) and the
// loser-mutation law ported verbatim from pong-quilt C1.

const test = require("node:test");
const assert = require("node:assert/strict");

const { rng } = require("../src/rng");
const { runCoevGeneration, runTournament } = require("../src/engine");
const { netId } = require("../src/ledger");

// Minimal toy arena: numbers-in, numbers-out, winner = closer to the rival's
// negation. Not a game — proof that the engine is domain-agnostic.
const toy = {
  makeNet: (rand) => [rand(), rand()],
  mutate: (net, rand, sigma) => net.map((v) => v + (rand() - 0.5) * sigma),
  compete: (a, b, rand) => {
    const aScore = -Math.abs(a[0] + b[0]); // a wants a[0] ≈ -b[0]
    const bScore = -Math.abs(b[1] + a[1]); // b wants b[1] ≈ -a[1]
    return { aFitness: aScore, bFitness: bScore,
             outcome: Math.abs(aScore) < Math.abs(bScore) ? "A-WINS" : "B-WINS" };
  },
  aWins: "A-WINS", bWins: "B-WINS",
  netId: (n) => netId(n),
};

test("runCoevGeneration: loser mutates at 2x sigma, winner side at 1x", () => {
  const rand = rng(5);
  const popA = [[0.1], [0.2], [0.3], [0.4]];
  const popB = [[0.9], [0.8], [0.7], [0.6]];
  const scoredA = popA.map((net, i) => ({ net, aFitness: 4 - i }));
  const scoredB = popB.map((net, i) => ({ net, bFitness: 4 - i }));
  const lostB = runCoevGeneration(popA, popB, scoredA, scoredB, rand, 0.1, "A-WINS",
    { elites: 2, mutate: toy.mutate });
  assert.equal(lostB.sigA, 0.1);
  assert.equal(lostB.sigB, 0.2);
  assert.equal(lostB.loserId, netId(scoredB[0].net));
  const lostA = runCoevGeneration(popA, popB, scoredA, scoredB, rng(5), 0.1, "B-WINS",
    { elites: 2, mutate: toy.mutate });
  assert.equal(lostA.sigA, 0.2);
  assert.equal(lostA.sigB, 0.1);
  assert.equal(lostA.loserId, netId(scoredA[0].net));
  const draw = runCoevGeneration(popA, popB, scoredA, scoredB, rng(5), 0.1, "DRAW",
    { elites: 2, mutate: toy.mutate });
  assert.equal(draw.loserId, null);
});

test("runCoevGeneration: elites copied intact, population size preserved", () => {
  const popA = [[0.1], [0.2], [0.3], [0.4], [0.5]];
  const popB = [[0.9], [0.8], [0.7], [0.6], [0.55]];
  const scoredA = popA.map((net, i) => ({ net, aFitness: 5 - i }));
  const scoredB = popB.map((net, i) => ({ net, bFitness: 5 - i }));
  const out = runCoevGeneration(popA, popB, scoredA, scoredB, rng(11), 0.01, null,
    { elites: 2, mutate: toy.mutate });
  assert.equal(out.popA.length, 5);
  assert.equal(out.popB.length, 5);
  assert.deepEqual(out.popA[0], scoredA[0].net); // elite copy, intact
  assert.deepEqual(out.popA[1], scoredA[1].net);
  assert.deepEqual(out.popB[0], scoredB[0].net);
});

test("runCoevGeneration: requires a mutate function (clear error, not a TypeError maze)", () => {
  assert.throws(() => runCoevGeneration([], [], [], [], rng(1), 0.1, null, {}),
    /opts\.mutate/);
});

test("runTournament: same seed -> byte-identical champions and ledger", () => {
  const run = (seed) => runTournament({ arena: toy, seed, pop: 8, gens: 6, elites: 2 });
  const r1 = run(123), r2 = run(123), r3 = run(124);
  assert.equal(netId(r1.aChamp.net), netId(r2.aChamp.net));
  assert.equal(netId(r1.bChamp.net), netId(r2.bChamp.net));
  assert.deepEqual(r1.ledger.items(), r2.ledger.items());
  assert.notEqual(netId(r1.aChamp.net), netId(r3.aChamp.net));
});

test("runTournament: ledger rows carry the h2h receipt fields", () => {
  const { ledger } = runTournament({ arena: toy, seed: 3, pop: 6, gens: 4, elites: 2 });
  const rows = ledger.items();
  assert.equal(rows.length, 5); // probe gen 0 + gens 1..4
  for (const r of rows) {
    assert.ok("aId" in r && "bId" in r && "outcome" in r && "aFit" in r && "bFit" in r);
    assert.match(r.outcome, /A-WINS|B-WINS/);
  }
  assert.equal(rows[0].gen, 0);
  assert.equal(rows[4].gen, 4);
});
