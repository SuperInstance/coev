# coev

**Adversarial coevolution engine with champion-integrity auditing. Zero dependencies. Node ≥ 18.**

Two populations. Red vs blue. Every individual of each side faces the *other* side's champion every generation — minimax-style alternating pressure, the classic GAN pairing transplanted to evolution. **The loser mutates harder**: the side that lost the last head-to-head breeds at 2× mutation this generation, while its elites are copied intact. Pressure lands on the offspring, never on the champion's memory.

And because a coevolved champion is exactly the kind of artifact people lie to themselves about, every champion ships with an **auditor**: re-benchmark it against a fixed seeded suite and get a verdict — `CONFIRMED`, `REFUTED`, or `MEASURED` — with the numbers printed.

```bash
npx coev demo            # short tournament + self-audit, ~seconds
npx coev run --seed 42 --pop 24 --gens 30 --out ./out
npx coev audit --champion out/result.json --opponent their-champ.json --claim 1259.1
```

## Why the auditor exists

This engine was extracted from [SuperInstance/pong-quilt](https://github.com/SuperInstance/pong-quilt), where two paddles coevolve: a survivor holding the bottom line, an ender hunting it from the top. In September 2026 a "continued training" run silently shipped a champion that *claimed* fitness 1259.1 but benched **239.6** — structurally a noise net (L2 distance 11.91). The ledger looked fine. The number was hollow. The run was only caught because someone re-benchmarked the champion against a fixed K-game suite with derived seeds.

That class of failure is not specific to paddles. Any adversarial system — GANs, red-team/blue-team sims, game AI, fuzzer vs parser — can produce a champion whose recorded fitness says more than its weights do. `coev audit` makes the check one command, and `REFUTED` exits 1 so it can gate a CI pipeline:

```bash
coev audit --champion ./champ.json --opponent ./benchmark-ender.json --claim 1259.1 --k 30 \
  || { echo "champion is hollow — refuse the release"; exit 1; }
```

## Quickstart (library)

```js
const { runTournament, audit } = require("coev");
const arena = require("coev/arenas/pong");

const { aChamp, bChamp, ledger } = runTournament({
  arena, seed: 42, pop: 24, gens: 30, sigma: 0.12, elites: 4,
  onGen: (gen, r) => console.log(`gen ${gen}: ${r.outcome} ${r.frames}f`),
});

const rep = audit.championReport(aChamp.net, {
  arena, opponent: bChamp.net, k: 30, claim: 1259.1, tolerance: 0.05,
});
console.log(rep.verdict, rep.measured, rep.detail);
```

Everything is deterministic given the seed: same seed → byte-identical populations, champions, and ledger. That property is what makes the auditor meaningful — a benchmark replayed under a fixed seed either reproduces a claim or it doesn't.

## Verdict vocabulary

| verdict | meaning |
|---|---|
| `CONFIRMED` | measured within tolerance of the claim |
| `REFUTED` | measured contradicts the claim beyond tolerance — "hollow champion" |
| `SIMULATED` | a claim with no measurement behind it — unverified by construction |
| `MEASURED` | a real measurement with nothing claimed — record, don't verdict |

`SIMULATED` is the word for the sin this repo exists to catch: a receipt that asserts it ran but never executed. Say the quiet part out loud.

## Write your own arena

The engine is domain-agnostic. An arena is five functions:

```js
const myArena = {
  name: "my-domain",
  makeNet(rand)              { /* fresh individual, any JSON value */ },
  mutate(net, rand, sigma)   { /* mutated copy */ },
  compete(a, b, rand, opts)  { /* -> { aFitness, bFitness, outcome } */ },
  aWins: "A-WINS",           /* outcome string when side A prevails */
  bWins: "B-WINS",
  netId(net)                 { /* optional; content id for the ledger */ },
};
```

Full guide with the reference implementation (the pong adversarial game, ported with its escalation laws — shrinking paddles, black swans, compounding speed) in **[docs/ARENA.md](docs/ARENA.md)**. The audit methodology is written up in **[docs/INTEGRITY.md](docs/INTEGRITY.md)**.

## CLI

```
coev run    --arena pong --seed N --pop N --gens N --sigma F --elites N --frames N --out DIR
coev audit  --champion FILE --opponent FILE [--claim F] [--k N] [--tolerance F] [--base-seed N]
coev demo   [same flags as run, smaller defaults]
```

Usage errors exit 2 with the usage line; `audit` exits 1 on `REFUTED`. A seed of `0` is a real seed, never falsy-collapsed into a default.

## Modules (each requires standalone)

| module | what it does |
|---|---|
| `coev/src/rng` | seeded LCG — byte-reproducible streams |
| `coev/src/ring` | bounded FIFO that admits it forgets (monotonic writes, honest eviction) |
| `coev/src/evaluator` | streaming top-K evaluation with bounded memory + a tie-breaker seam |
| `coev/src/ledger` | hash-chained receipt ledger, tamper-evident, honest eviction count |
| `coev/src/engine` | the coevolution loop (loser mutates harder) |
| `coev/src/audit` | the champion-integrity auditor |

## Provenance & weight-law edges

Extracted from `SuperInstance/pong-quilt` @ `b4d15c8` (the C1 engine). The ring and evaluator were ported there from `SuperInstance/quilt-edge-ml` (`ring_buffer.py`, `out_of_core.py`). The auditor encodes the R53/R54 save. In-repo citation edges, per the fleet's weight law:

- `coev -> pq-c1` — engine, ledger, rng, pong arena ported from pong-quilt's C1
- `coev -> qe-ml` — ring/evaluator design lineage via the pong-quilt port

## License

MIT.
