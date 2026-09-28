'use strict';
// Seeded LCG — byte-reproducible streams. Ported verbatim from
// SuperInstance/pong-quilt core.js @ b4d15c8 (R54), the C1 coevolution engine.
// The whole stack is deterministic given a seed: same seed => same populations,
// same champions, same ledger. That property is what makes the integrity
// auditor (src/audit.js) possible — a benchmark replayed under a fixed seed
// either reproduces a champion's claim or it doesn't.

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

module.exports = { rng };
