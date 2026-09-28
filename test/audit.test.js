'use strict';
// Audit pins — the R53/R54 lesson as executable law. These were written
// FAIL-first against a deliberately hollow champion (a noise net claiming a
// real champion's fitness): REFUTED went red-as-green-required before the
// module settled.

const test = require("node:test");
const assert = require("node:assert/strict");

const { auditClaim, benchmarkChamp, championReport, CONFIRMED, REFUTED, SIMULATED, MEASURED } = require("../src/audit");
const { rng } = require("../src/rng");
const arena = require("../arenas/pong");

test("auditClaim: no measurement -> SIMULATED, never silent confirmation", () => {
  const v = auditClaim({ claim: 1259.1, measured: null });
  assert.equal(v.verdict, SIMULATED);
  assert.match(v.detail, /unverified/);
});

test("auditClaim: within tolerance -> CONFIRMED", () => {
  const v = auditClaim({ claim: 1259.1, measured: 1251.0, tolerance: 0.05 });
  assert.equal(v.verdict, CONFIRMED);
  assert.ok(v.relError <= 0.05);
});

test("auditClaim: 239.6 against 1259.1 -> REFUTED with the hollow-champion sentence", () => {
  // The exact R53/R54 numbers from SuperInstance/pong-quilt: a "continued"
  // champion benched 239.6 while claiming the artifact's 1259.1.
  const v = auditClaim({ claim: 1259.1, measured: 239.6, tolerance: 0.05, label: "r53-champion" });
  assert.equal(v.verdict, REFUTED);
  assert.ok(v.relError > 0.8);
  assert.match(v.detail, /hollow champion/);
});

test("benchmarkChamp: K games, each under its own derived seed, replayable", () => {
  const rand = rng(20260924);
  const champ = arena.makeNet(rand), opp = arena.makeNet(rand);
  const b1 = benchmarkChamp(champ, { arena, opponent: opp, k: 10, baseSeed: 97000 });
  const b2 = benchmarkChamp(champ, { arena, opponent: opp, k: 10, baseSeed: 97000 });
  assert.equal(b1.mean, b2.mean); // replayable
  assert.equal(b1.runs.length, 10);
  for (const f of b1.runs) assert.ok(Number.isFinite(f));
});

test("benchmarkChamp: a trained champ out-benches a fresh net on average", () => {
  // Light real training. Parameters probed empirically: seeds 77/short-horizon
  // tie exactly (both die at the same frame under the same ender) — evolution
  // needs enough generations for separation. seed 5 / 20 gens separates by
  // ~208 fitness points; pinned, deterministic.
  const { runTournament } = require("../src/engine");
  const { aChamp, bChamp } = runTournament({ arena, seed: 5, pop: 16, gens: 20, elites: 3,
    maxFrames: 1500 });
  const fresh = arena.makeNet(rng(1));
  const trained = benchmarkChamp(aChamp.net, { arena, opponent: bChamp.net, k: 15, maxFrames: 1500 });
  const novice = benchmarkChamp(fresh, { arena, opponent: bChamp.net, k: 15, maxFrames: 1500 });
  assert.ok(trained.mean > novice.mean,
    `trained ${trained.mean} should beat novice ${novice.mean}`);
});

test("championReport: full row carries provenance + verdict", () => {
  const rand = rng(20260924);
  const champ = arena.makeNet(rand), opp = arena.makeNet(rand);
  const rep = championReport(champ, { arena, opponent: opp, k: 5, claim: null, maxFrames: 600 });
  assert.equal(rep.k, 5);
  assert.equal(rep.verdict, MEASURED); // real benchmark, nothing claimed
  assert.ok(rep.opponentId); // provenance: who the benchmark ran against
  assert.equal(typeof rep.baseSeed, "number");
});
