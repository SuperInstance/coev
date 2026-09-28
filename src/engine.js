'use strict';
// The adversarial coevolution engine — generalized from SuperInstance/pong-quilt
// core.js @ b4d15c8 (C1, "the GAN pair"), with the engine/arena split made
// explicit so any competitive domain plugs in.
//
// ARENA INTERFACE — your domain provides an object with:
//   makeNet(rand)              -> a fresh individual (any JSON-serializable value)
//   mutate(net, rand, sigma)   -> a mutated copy
//   compete(a, b, rand, opts)  -> head-to-head result { aFitness, bFitness,
//                                   outcome: "<A-WINS>" | "<B-WINS>" | "DRAW", ... }
//   netId(net)                 -> stable content id (default: src/ledger.netId)
//
// THE LOOP (unchanged from the source semantics):
//   Every generation, every individual of each side faces the OTHER side's
//   champion (minimax-style alternating pressure, classic GAN pairing). THE
//   LOSER MUTATES HARDER: the side that lost the last head-to-head breeds at
//   2x sigma this generation — elites are still copied intact (accumulation
//   survives; pressure lands on the loser's offspring, not on its champion's
//   memory). Deterministic given rand: same seed => same populations, same
//   ledger (md5-verified in the source repo by tools/prerun-coev.js).

const { netId: defaultNetId } = require("./ledger");

function runCoevGeneration(popA, popB, scoredA, scoredB, rand, sigma, lastOutcome, opts) {
  const o = opts || {};
  const elites = o.elites || 4;
  const mutate = o.mutate, netId = o.netId || defaultNetId;
  const aWins = o.aWins || "A-WINS", bWins = o.bWins || "B-WINS";
  if (typeof mutate !== "function") throw new TypeError("runCoevGeneration: opts.mutate(net, rand, sigma) required");
  scoredA.sort((x, y) => y.aFitness - x.aFitness);
  scoredB.sort((x, y) => y.bFitness - x.bFitness);
  const champA = scoredA[0], champB = scoredB[0];
  const breed = (scored, key, sig) => {
    const next = [];
    for (let i = 0; i < elites; i++) next.push(JSON.parse(JSON.stringify(scored[i].net)));
    while (next.length < scored.length)
      next.push(mutate(scored[Math.floor(rand() * elites)].net, rand, sig));
    return next;
  };
  const sigA = lastOutcome === bWins ? sigma * 2 : sigma; // the loser mutates harder
  const sigB = lastOutcome === aWins ? sigma * 2 : sigma;
  const nextA = breed(scoredA, "aFitness", sigA), nextB = breed(scoredB, "bFitness", sigB);
  const loserId = lastOutcome === aWins ? netId(champB.net)
                : lastOutcome === bWins ? netId(champA.net) : null;
  return { popA: nextA, popB: nextB, aChamp: champA, bChamp: champB, loserId, sigA, sigB };
}

// Full tournament: run `gens` generations over two populations of size `pop`,
// scoring every individual against the rival champion and recording one
// head-to-head receipt per generation in the ledger. `opts` = {
//   arena, seed, pop, gens, sigma, elites, maxFrames, ledger, onGen(gen, receipt)
// } Returns { popA, popB, aChamp, bChamp, ledger }.
function runTournament(opts) {
  const { arena, seed = 1, pop = 24, gens = 30, sigma = 0.12, elites = 4,
          maxFrames, ledger, onGen } = opts;
  const rand = (opts.randFactory || defaultRand)(seed);
  let popA = Array.from({ length: pop }, () => arena.makeNet(rand));
  let popB = Array.from({ length: pop }, () => arena.makeNet(rand));
  const book = ledger || require("./ledger").makeLedger(gens + 1);
  let aChamp = { net: popA[0] }, bChamp = { net: popB[0] }, last = null;
  const probe = arena.compete(popA[0], popB[0], rand, { maxFrames });
  last = probe.outcome;
  book.write({ gen: 0, aId: arena.netId ? arena.netId(popA[0]) : defaultNetId(popA[0]),
               bId: arena.netId ? arena.netId(popB[0]) : defaultNetId(popB[0]),
               outcome: probe.outcome, frames: probe.frames,
               aFit: probe.aFitness, bFit: probe.bFitness });
  for (let gen = 1; gen <= gens; gen++) {
    const scoredA = popA.map((net) => {
      const r = arena.compete(net, bChamp.net, rand, { maxFrames });
      return { net, aFitness: r.aFitness };
    });
    const scoredB = popB.map((net) => {
      const r = arena.compete(aChamp.net, net, rand, { maxFrames });
      return { net, bFitness: r.bFitness };
    });
    const bred = runCoevGeneration(popA, popB, scoredA, scoredB, rand, sigma, last,
      { elites, mutate: arena.mutate, netId: arena.netId,
        aWins: arena.aWins, bWins: arena.bWins });
    popA = bred.popA; popB = bred.popB;
    const h2h = arena.compete(bred.aChamp.net, bred.bChamp.net, rand, { maxFrames });
    aChamp = bred.aChamp; bChamp = bred.bChamp; // keep net AND champion fitness
    last = h2h.outcome;
    const receipt = { gen,
      aId: arena.netId ? arena.netId(aChamp.net) : defaultNetId(aChamp.net),
      bId: arena.netId ? arena.netId(bChamp.net) : defaultNetId(bChamp.net),
      outcome: h2h.outcome, frames: h2h.frames,
      aFit: h2h.aFitness, bFit: h2h.bFitness, loserId: bred.loserId };
    book.write(receipt);
    if (onGen) onGen(gen, receipt);
  }
  return { popA, popB, aChamp, bChamp, ledger: book, last };
}

function defaultRand(seed) {
  return require("./rng").rng(seed);
}

module.exports = { runCoevGeneration, runTournament };
