# The integrity methodology

This is the essay behind `src/audit.js`. It generalizes a real incident.

## The incident (SuperInstance/pong-quilt, R53/R54, September 2026)

A coevolution artifact — 120 generations of adversarial paddle training — had
a "continue training" button. A continued run reported success: the ledger
filled, the HUD showed a champion, the checkpoint wrote. The champion's
recorded fitness lineage read **1259.1**.

Someone re-benchmarked it against the artifact's own ender under a fixed
K=30 suite. Measured: **239.6**. L2 distance between the claimed lineage and
the measured one: **11.91** — the gap between a trained net and a noise net.
The continuation had been hollow the whole time; the UI just never said so.

Two structural lessons:

1. **A ledger of receipts is not evidence the receipts are true.** Every row
   chained cleanly. The lie was not in the chain; it was in the claim each
   row carried.
2. **The catch was one command.** Fixed opponent, fixed K, derived seeds,
   compare. That's all an integrity audit is. The hard part is making it a
   habit, so the auditor ships with the engine instead of living in one
   engineer's head.

## The audit, formally

Given a champion `c`, a benchmark opponent `o`, a claim `F`, integers `K`,
base seed `S`, tolerance `τ`:

1. For `i` in `0..K-1`: run `compete(c, o, rng(S+i))` and record `aFitness`.
2. `measured = mean(runs)`; `spread = stddev(runs)`.
3. If no claim was provided → verdict `MEASURED`. Record it; verify nothing.
4. If `|measured − F| / max(|F|, 1) ≤ τ` → `CONFIRMED`, else → `REFUTED`.

Provenance travels with the row: opponent content-id, K, S, the raw runs. A
verdict without provenance is itself a half-receipt.

Derived seeds (`S+i`) matter: every benchmark game gets its own stream, so
the suite covers the opponent's response distribution rather than replaying
one lucky game K times, and the whole suite replays bit-for-bit on demand.

## The verdict vocabulary is load-bearing

- `CONFIRMED` — the claim survives contact with measurement.
- `REFUTED` — the claim fails; print both numbers and the relative error.
  In the incident: measured 239.6 vs claimed 1259.1, ~81% off. The auditor
  must be free to say this loudly; a gate that cannot fail is decoration.
- `SIMULATED` — the claim exists but was never executed. The receipts
  equivalent of vaporware. Distinct from REFUTED: refutation required real
  measurement; simulation admits there was none.
- `MEASURED` — real measurement, nothing claimed. Honest calibration data.

Keeping `SIMULATED` and `MEASURED` as first-class verdicts prevents the two
classic dodges: asserting without measuring (SIMULATED names it) and
measuring without ever asserting a falsifiable claim (MEASURED names it).

## Gating

`coev audit` exits 1 on REFUTED. Wire it into CI:

```bash
coev audit --champion dist/champ.json --opponent test/ender.json \
  --claim "$RECORDED_FITNESS" --k 30 --tolerance 0.05 \
  || { echo "release refused: champion does not reproduce its claim"; exit 1; }
```

The gate only works if the claim it checks came from a *measured* record —
feed it the ledger's champion fitness, not the marketing page.
