'use strict';
// CLI pins: usage errors exit 2 with the usage line; seed 0 plays verbatim;
// the demo runs end-to-end. (spawn-based, zero deps.)

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const BIN = path.join(__dirname, "..", "bin", "coev.js");

function run(args) {
  return spawnSync(process.execPath, [BIN].concat(args), { encoding: "utf8" });
}

test("cli: unknown command -> exit 2 + usage", () => {
  const r = run(["frobnicate"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: coev/);
});

test("cli: positional argument refused, not silently ignored", () => {
  const r = run(["run", "stray"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unrecognized positional/);
});

test("cli: valueless flag is a usage error, not a silent default", () => {
  const r = run(["run", "--seed"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /requires a value/);
});

test("cli: non-integer seed named, not coerced", () => {
  const r = run(["run", "--seed", "abc"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must be an integer/);
});

test("cli: unknown arena named with the path looked up", () => {
  const r = run(["run", "--arena", "nope"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown arena 'nope'/);
});

test("cli: demo runs end-to-end and prints an audit verdict", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coev-demo-"));
  const r = run(["demo", "--out", tmp]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /demo audit: k=10 mean=[\d.]+ spread=[\d.]+ claim=none -> MEASURED/);
  assert.ok(fs.existsSync(path.join(tmp, "result.json")));
});

test("cli: audit accepts a tournament result.json as --champion, announcing the unwrap", () => {
  // REGRESSION pin: passing result.json used to hand the WHOLE result object
  // to the arena as a net (TypeError in forward). Now it unwraps to aChamp
  // and says so on stderr. Red before the loadNet fix, green after.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coev-unwrap-"));
  execFileSync(process.execPath, [BIN, "run", "--seed", "5", "--pop", "6", "--gens", "2",
    "--frames", "400", "--out", tmp], { encoding: "utf8" });
  const r = run(["audit", "--champion", path.join(tmp, "result.json"),
    "--opponent", path.join(tmp, "result.json"), "--k", "2", "--frames", "400"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /using its aChamp/);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.verdict, "MEASURED");
});

test("cli: audit REFUTED exits 1 (a hollow champion fails the gate)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coev-audit-"));
  // Champion and opponent from the same tournament; claim a absurdly high.
  execFileSync(process.execPath, [BIN, "run", "--seed", "5", "--pop", "6", "--gens", "2",
    "--frames", "400", "--out", tmp], { encoding: "utf8" });
  const res = JSON.parse(fs.readFileSync(path.join(tmp, "result.json"), "utf8"));
  fs.writeFileSync(path.join(tmp, "champ.json"), JSON.stringify(res.aChamp.net));
  fs.writeFileSync(path.join(tmp, "opp.json"), JSON.stringify(res.bChamp.net));
  const r = run(["audit", "--champion", path.join(tmp, "champ.json"),
    "--opponent", path.join(tmp, "opp.json"), "--claim", "999999", "--k", "3", "--frames", "400"]);
  assert.equal(r.status, 1);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.verdict, "REFUTED");
});
