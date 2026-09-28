'use strict';
// Champion-integrity auditor — extracted from the R53/R54 save in
// SuperInstance/pong-quilt. There, a "continued training" run silently
// shipped a champion benching 239.6 against the artifact champion's own
// 1259.1 (L2 distance 11.91 — structurally a noise net). The ledger looked
// fine; the number was hollow. The auditor exists so that class of lie can
// never pass quietly again.
//
// Method: claim -> measured -> verdict, with explicit provenance for every
// input. A claim with no measurement is SIMULATED. A measurement that
// disagrees with the claim beyond tolerance is REFUTED with both numbers
// printed. A claim that matches within tolerance is CONFIRMED. Verdicts are
// strings, not vibes — they go in receipts.

const CONFIRMED = "CONFIRMED";
const REFUTED = "REFUTED";
const SIMULATED = "SIMULATED";
const MEASURED = "MEASURED"; // real measurement, nothing claimed — record, don't verdict

// auditClaim({ claim, measured, tolerance, label }) -> verdict row.
//   claim:    the number someone asserts (fitness, score, speedup...)
//   measured: what you actually observed, or null if never measured
//   tolerance: relative slack |claim-measured|/max(|claim|,1) to call a match
function auditClaim({ claim, measured, tolerance = 0.05, label = "claim" }) {
  if (measured === null || measured === undefined) {
    return { verdict: SIMULATED, label, claim, measured: null,
             detail: "no measurement performed — claim is unverified by construction" };
  }
  if (claim === null || claim === undefined) {
    return { verdict: MEASURED, label, claim: null, measured,
             detail: "measurement recorded, no claim to verify" };
  }
  const denom = Math.max(Math.abs(claim), 1);
  const rel = Math.abs(claim - measured) / denom;
  if (rel <= tolerance) {
    return { verdict: CONFIRMED, label, claim, measured, relError: rel,
             detail: `measured ${measured} within ${(rel * 100).toFixed(2)}% of claim ${claim}` };
  }
  return { verdict: REFUTED, label, claim, measured, relError: rel,
           detail: `measured ${measured} is ${(rel * 100).toFixed(2)}% off claim ${claim} — hollow champion` };
}

// benchmarkChamp(champNet, { arena, opponent, k, maxFrames, baseSeed }) ->
//   { mean, spread, runs } — a fixed K-game benchmark against a named
//   opponent, each game under its own derived seed (baseSeed+i), so the
//   benchmark is itself replayable and its provenance is explicit.
function benchmarkChamp(champNet, { arena, opponent, k = 30, maxFrames, baseSeed = 97000 }) {
  const { rng } = require("./rng");
  const runs = [];
  for (let i = 0; i < k; i++) {
    const r = arena.compete(champNet, opponent, rng(baseSeed + i), { maxFrames });
    runs.push(r.aFitness);
  }
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const spread = Math.sqrt(runs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / runs.length);
  return { mean, spread, runs };
}

// championReport(champ, { arena, opponent, k, maxFrames, baseSeed, claim,
//                 tolerance }) -> the full R53/R54-style audit row: fixed
//   benchmark + provenance + claim comparison + honest verdict.
function championReport(champNet, opts) {
  const { claim = null, tolerance = 0.05, label = "champion" } = opts;
  const bench = benchmarkChamp(champNet, opts);
  const verdict = auditClaim({ claim, measured: bench.mean, tolerance, label });
  return Object.assign({ k: opts.k || 30, baseSeed: opts.baseSeed ?? 97000,
                         opponentId: opts.arena.netId ? opts.arena.netId(opts.opponent) : null },
                       bench, verdict);
}

module.exports = { auditClaim, benchmarkChamp, championReport,
                   CONFIRMED, REFUTED, SIMULATED, MEASURED };
