'use strict';
// Streaming fitness evaluation. Ported from SuperInstance/pong-quilt core.js
// @ b4d15c8, which ported it from SuperInstance/quilt-edge-ml out_of_core.py:
// evaluate candidates in bounded batches instead of one blocking loop, retain
// ONLY a top-K elite archive + running stats, so memory stays flat no matter
// the population size and a UI can spread one generation across frames.
//
// The onTie seam is preserved from the source: equal-fitness challengers lose
// silently by default (strict > keeps the incumbent). Wire a tiebreaker to
// make ties honest — a receipted coin, a journal, whatever your system
// believes in. The seam exists so the default can stay behavior-compatible.

function makeEvaluator(candidates, evalOne, opts) {
  const eliteK = (opts && opts.eliteK) || 4;
  const onTie = (opts && opts.onTie) || null;
  let i = 0, sum = 0;
  let best = null;
  const elites = [];
  return {
    step(n) {
      const stop = Math.min(candidates.length, i + (n === undefined ? 1 : n));
      for (; i < stop; i++) {
        const r = evalOne(candidates[i], i);
        const rec = Object.assign({ index: i }, r, { net: candidates[i] });
        sum += r.fitness;
        if (!best || r.fitness > best.fitness ||
            (r.fitness === best.fitness && onTie && onTie(rec, best))) best = rec;
        let j = elites.length;
        while (j > 0 && elites[j - 1].fitness < r.fitness) j--;
        if (j < eliteK) {
          elites.splice(j, 0, rec);
          if (elites.length > eliteK) elites.pop();
        }
      }
      return { done: i >= candidates.length, evaluated: i, total: candidates.length,
               elites: elites.slice(), best, mean: i ? sum / i : 0 };
    },
    get done() { return i >= candidates.length; },
    get evaluated() { return i; },
  };
}

module.exports = { makeEvaluator };
