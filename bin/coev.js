#!/usr/bin/env node
'use strict';
// coev CLI — run tournaments, audit champions, print receipts.
// Zero dependencies. Usage errors exit 2 with the usage line (the
// seed-zero-honesty lesson from pong-quilt R43: an explicit flag is played
// verbatim, never falsy-collapsed into a default).

const fs = require("fs");
const path = require("path");

const USAGE = `usage: coev <command> [options]

commands:
  run       run a tournament, write champions + ledger JSON
            --arena pong          arena module (default pong; more as they land)
            --seed <int>          tournament seed (verbatim; 0 is a real seed)
            --pop <int>           population per side (default 24)
            --gens <int>          generations (default 30)
            --sigma <float>       mutation sigma (default 0.12)
            --elites <int>        elite copies per side (default 4)
            --frames <int>        max frames per head-to-head
            --out <dir>           output directory (default ./coev-out)

  audit     re-benchmark a champion against a named opponent, verdict the claim
            --champion <file.json|net.json>   the champion weights
            --opponent <file.json>            the benchmark opponent (required)
            --claim <float>                   the fitness someone asserts
            --k <int>                         benchmark games (default 30)
            --tolerance <float>               relative slack (default 0.05)
            --base-seed <int>                 benchmark seed base (default 97000)

  demo      short tournament + self-audit, printed — the integrity loop
            end-to-end in a few seconds. Same flags as run (smaller defaults).
`;

function die(msg, code) {
  console.error("coev: " + msg);
  console.error(USAGE);
  process.exit(code === undefined ? 2 : code);
}

function parseArgs(argv) {
  const cmd = argv[2];
  const o = { _: [] };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) die(`flag --${key} requires a value`, 2);
      o[key] = val; i++;
    } else o._.push(a);
  }
  return { cmd, o };
}

function intArg(o, key, dflt) {
  if (!(key in o)) return dflt;
  const v = Number(o[key]);
  if (!Number.isInteger(v)) die(`--${key} must be an integer, got '${o[key]}'`, 2);
  return v;
}
function numArg(o, key, dflt) {
  if (!(key in o)) return dflt;
  const v = Number(o[key]);
  if (!isFinite(v)) die(`--${key} must be a number, got '${o[key]}'`, 2);
  return v;
}
function loadArena(name) {
  const p = path.join(__dirname, "..", "arenas", name + ".js");
  if (!fs.existsSync(p)) die(`unknown arena '${name}' (looked for ${p})`, 2);
  return require(p);
}
function loadNet(file, what) {
  const p = path.resolve(file);
  let obj;
  try { obj = JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { die(`cannot read ${what} '${p}': ${e.message}`, 2); }
  // Ergonomic unwrapping, always announced on stderr: a runTournament
  // result.json carries champions under aChamp/bChamp; a champion record may
  // wrap its net under .net. Refuse anything that isn't a plain object.
  if (obj.aChamp && obj.aChamp.net) {
    console.error(`coev: ${what}: '${path.basename(p)}' is a tournament result — using its aChamp`);
    obj = obj.aChamp.net;
  } else if (obj.net && typeof obj.net === "object") {
    obj = obj.net;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj))
    die(`${what} '${p}' did not resolve to a network object`, 2);
  return obj;
}

function cmdRun(o, demo) {
  const arena = loadArena(o.arena || "pong");
  const seed = intArg(o, "seed", demo ? 7 : 1);
  const pop = intArg(o, "pop", demo ? 12 : 24);
  const gens = intArg(o, "gens", demo ? 10 : 30);
  const sigma = numArg(o, "sigma", 0.12);
  const elites = intArg(o, "elites", 4);
  const maxFrames = intArg(o, "frames", 0) || undefined;
  const out = path.resolve(o.out || (demo ? "./coev-demo-out" : "./coev-out"));
  const engine = require("../src/engine");
  const { netId } = require("../src/ledger");
  const t0 = Date.now();
  const { aChamp, bChamp, ledger } = engine.runTournament({
    arena, seed, pop, gens, sigma, elites, maxFrames,
    onGen: (gen, r) => { if (demo || gen % 10 === 0 || gen === gens)
      console.log(`gen ${gen}/${gens}  h2h ${r.outcome} ${r.frames}f  aFit ${r.aFit | 0}  bFit ${r.bFit | 0}`); },
  });
  fs.mkdirSync(out, { recursive: true });
  const result = { arena: arena.name, seed, pop, gens, sigma, elites, ms: Date.now() - t0,
    aChamp: { id: netId(aChamp.net), net: aChamp.net },
    bChamp: { id: netId(bChamp.net), net: bChamp.net },
    ledger: ledger.items() };
  const resultPath = path.join(out, "result.json");
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 1) + "\n");
  console.log(`coev: ${gens} gens x ${pop}+${pop} -> ${path.relative(process.cwd(), resultPath)}`);
  if (demo) {
    const { championReport } = require("../src/audit");
    // No claim is manufactured for the demo: a single head-to-head score is a
    // sample, not a verified fitness. The auditor prints the measurement and
    // says MEASURED — teaching the vocabulary by honest example.
    const rep = championReport(aChamp.net, { arena, opponent: bChamp.net, k: 10,
      claim: null, tolerance: 0.10 });
    console.log(`demo audit: k=${rep.k} mean=${rep.mean.toFixed(1)} spread=${rep.spread.toFixed(1)}` +
      ` claim=none -> ${rep.verdict}`);
    console.log(`demo audit detail: ${rep.detail}`);
  }
  return result;
}

function cmdAudit(o) {
  const arena = loadArena(o.arena || "pong");
  if (!o.champion) die("audit requires --champion <file>", 2);
  if (!o.opponent) die("audit requires --opponent <file> (the benchmark opponent)", 2);
  const champ = loadNet(o.champion, "champion");
  const opponent = loadNet(o.opponent, "opponent");
  if (arena.validate && !arena.validate(champ))
    die(`champion failed arena '${arena.name}' validation (wrong shape for this arena?)`, 2);
  if (arena.validate && !arena.validate(opponent))
    die(`opponent failed arena '${arena.name}' validation (wrong shape for this arena?)`, 2);
  const claim = "claim" in o ? numArg(o, "claim", 0) : null;
  const k = intArg(o, "k", 30);
  const tolerance = numArg(o, "tolerance", 0.05);
  const baseSeed = intArg(o, "base-seed", 97000);
  const { championReport } = require("../src/audit");
  const rep = championReport(champ, { arena, opponent, k, claim, tolerance, baseSeed });
  console.log(JSON.stringify(rep, null, 1));
  process.exit(rep.verdict === "REFUTED" ? 1 : 0);
}

const { cmd, o } = parseArgs(process.argv);
if (o._.length) die(`unrecognized positional argument '${o._[0]}'`, 2);
if (cmd === "run") cmdRun(o, false);
else if (cmd === "demo") cmdRun(o, true);
else if (cmd === "audit") cmdAudit(o);
else die(`unknown command '${cmd}'`, 2);
