# Writing an arena

An arena is the domain plug-in. The engine (`src/engine.js`) is deliberately
dumb about what it's evolving; all domain knowledge lives in five functions.

## The interface

```js
const arena = {
  name: "my-domain",              // for receipts and the CLI

  // GENETICS
  makeNet(rand)            { ... },  // fresh individual; any JSON-serializable value
  mutate(net, rand, sigma) { ... },  // return a MUTATED COPY; never mutate in place

  // COMPETITION
  // Side A vs side B under one rand stream. Must return:
  //   aFitness  — number, higher is better, for side A's individual
  //   bFitness  — number, higher is better, for side B's individual
  //   outcome   — arena-defined string; MUST be arena.aWins or arena.bWins
  //               (anything else is treated as a draw: no loser-mutation)
  // plus any extra fields you want in the ledger receipt (frames, hits, ...).
  compete(a, b, rand, opts) { ... },

  aWins: "A-WINS",                // exact outcome string when side A prevails
  bWins: "B-WINS",                // exact outcome string when side B prevails

  // OPTIONAL
  netId(net) { ... },             // content id; default is src/ledger.netId
                                  // (JSON hash — fine for most values)
  validate(net) { ... },          // shape check used by the CLI to refuse
                                  // garbage before a confusing TypeError
};
```

`opts` passed to `compete` carries `maxFrames` (or your domain's budget name —
the engine just forwards `opts.maxFrames`); treat it as a soft cap and report
the actual budget used in your receipt fields.

## The loop you are plugging into

1. Both populations are genesis-drawn from `makeNet(rand)` under one stream.
2. Each generation: every A-individual competes against **B's current
   champion**; every B-individual against **A's current champion**
   (minimax-style alternating pressure — classic GAN pairing).
3. Each side sorts by fitness; the top `elites` are copied **intact**; the
   rest are bred from elite parents by `mutate`.
4. **The loser mutates harder.** Whichever side lost the previous
   head-to-head breeds this generation at 2× sigma. Accumulation survives
   (elites untouched); pressure lands on the loser's offspring.
5. The two champions fight one head-to-head; its receipt (ids, outcome,
   fitness, your extra fields) lands in the hash-chained ledger.

Determinism contract: given the same seed, your arena must draw from the rand
stream in the same order — no `Math.random()`, no wall-clock, no iteration
over unordered structures. Determinism is what makes the auditor possible.

## Fitness design notes (learned the hard way)

- **Give both sides a score even in defeat.** The engine sorts by fitness;
  a side that always scores 0 gives evolution no gradient. The reference pong
  arena scores the ender for kills *and* ender-hits even when the survivor
  reaches the cap.
- **Prefer smooth over sparse.** Frames survived > win/loss boolean. Sparse
  fitness creates plateaus where 20 generations can separate nobody (seen in
  practice — the shipped pin `benchmarkChamp: a trained champ out-benches a
  fresh net` documents a probe where short training tied a fresh net exactly).
- **Caps are claims.** If `maxFrames` bounds a game, say so in the receipt
  fields. A fitness number without its budget context is a half-truth.

## Reference implementation

`arenas/pong.js` is the worked example: two paddles, a ball, shrinking
paddles, quadratic black swans, a compounding speed boost — the full
escalation law set, ported from SuperInstance/pong-quilt core.js @ b4d15c8.
Read it after this file; it is commented at the decision points.
