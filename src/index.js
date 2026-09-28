'use strict';
// coev — adversarial coevolution engine with champion-integrity auditing.
// Barrel for library consumers; the CLI lives in bin/coev.js.

const { rng } = require("./rng");
const { makeRing } = require("./ring");
const { makeEvaluator } = require("./evaluator");
const { hash8, netId, makeLedger, verifyLedger } = require("./ledger");
const { runCoevGeneration, runTournament } = require("./engine");
const audit = require("./audit");

module.exports = { rng, makeRing, makeEvaluator, hash8, netId, makeLedger,
                   verifyLedger, runCoevGeneration, runTournament, audit };
