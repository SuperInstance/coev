'use strict';
// Canonical suite runner: node tools/run-tests.js
// (The bare-directory `node --test test/` form is version-fragile across Node
// releases; naming files explicitly keeps the suite deterministic. The
// pong-quilt R15 lesson: name the command that works, flag the one that
// doesn't.)
const { execFileSync } = require("node:child_process");
const files = ["core", "engine", "audit", "arena-pong", "cli"]
  .map((n) => `test/${n}.test.js`);
try {
  const out = execFileSync(process.execPath, ["--test", ...files],
    { encoding: "utf8", stdio: "inherit" });
  process.exit(0);
} catch (e) {
  process.exit(e.status || 1);
}
