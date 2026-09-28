'use strict';
// Reference arena: the pong-quilt adversarial paddle game ("C1"), ported from
// SuperInstance/pong-quilt core.js @ b4d15c8. A survivor paddle holds the
// bottom line; an ender paddle holds the top and blocks the ball back down
// with a compounding speed boost. Rallies accelerate, paddles shrink, black
// swans scale with speed — a perfect-reaction oracle ALWAYS eventually dies
// (pinned 40/40 seeds in the source repo, R50).
//
// This file is the worked example for the arena interface: genetics
// (makeNet/mutate), a symmetric head-to-head (compete), and content ids.
// Write your own by swapping every function here for your domain's.

const { netId } = require("../src/ledger");

const DEFAULTS = {
  popSize: 48, elites: 4, sigma: 0.12,
  decisionInterval: 4,        // frames between decisions = speed-of-action limit
  decisionDrift: 0.05,        // the model thinks slower as the game hardens
  decisionCap: 16,
  paddleW: 0.16, paddleSpeed: 0.02,
  paddleMin: 0.06,
  shrink: 0.999,
  ballBase: 0.004, ramp: 0.0004, hitBoost: 1.03,
  accel: 8e-7,
  maxSpeedMul: 6,
  swanP: 0.00008,
  swanGrow: 2,
  maxFrames: 6000, inDim: 6, hid: 10, outDim: 3,
};
const HIT_WEIGHT = 100; // at the frame cap a 0-hit survivor scores maxFrames; any hit adds 100
const EFFECTIVE_MARGIN = 0.02;

function makeNet(rand) {
  const { inDim, hid, outDim } = DEFAULTS, w1 = [], b1 = [], w2 = [], b2 = [];
  for (let i = 0; i < inDim * hid; i++) w1.push((rand() - 0.5) * 0.6);
  for (let i = 0; i < hid; i++) b1.push(0);
  for (let i = 0; i < hid * outDim; i++) w2.push((rand() - 0.5) * 0.6);
  for (let i = 0; i < outDim; i++) b2.push(0);
  return { w1, b1, w2, b2 };
}

function forward(net, inp) {
  const { hid, outDim } = DEFAULTS, h = [];
  for (let j = 0; j < hid; j++) {
    let s = net.b1[j];
    for (let i = 0; i < inp.length; i++) s += net.w1[i * hid + j] * inp[i];
    h.push(Math.tanh(s));
  }
  const o = [];
  for (let k = 0; k < outDim; k++) {
    let s = net.b2[k];
    for (let j = 0; j < hid; j++) s += net.w2[j * outDim + k] * h[j];
    o.push(s);
  }
  return o;
}

function mutate(net, rand, sigma) {
  const m = (a) => a.map((v) => v + (rand() + rand() + rand() - 1.5) * sigma);
  return { w1: m(net.w1), b1: m(net.b1), w2: m(net.w2), b2: m(net.b2) };
}

function fitnessOf(frames, hits) { return frames + hits * HIT_WEIGHT; }

function effectivePaddle(g) {
  const D = DEFAULTS, frames = g.frames || 0;
  const w = Math.max(D.paddleMin, D.paddleW * Math.pow(D.shrink, frames)) + 2 * EFFECTIVE_MARGIN;
  return { x: g.px - EFFECTIVE_MARGIN, w };
}

function sense(g) {
  return [g.x * 2 - 1, g.y * 2 - 1, g.vx, g.vy * (g.vy > 0 ? 1 : -1) * (g.vy > 0 ? 1 : -0.2),
          (g.px + DEFAULTS.paddleW / 2 - g.x) * 2, Math.min(1, g.speedMul / 3)];
}

function newGame(rand) {
  const a = (rand() * 0.8 + 0.7) * Math.PI * (rand() < 0.5 ? 0.25 : 0.75);
  return { x: 0.5, y: 0.5, vx: Math.cos(a), vy: Math.abs(Math.sin(a)),
           px: 0.42, hold: 0, frames: 0, hits: 0, speedMul: 1, maxSeen: 1 };
}

function stepShared(g, rand, swan) {
  const D = DEFAULTS;
  g.px = Math.max(0, Math.min(1 - D.paddleW, g.px + g.hold * D.paddleSpeed));
  const sp = D.ballBase * g.speedMul;
  g.x += g.vx * sp; g.y += g.vy * sp;
  if (g.x < 0) { g.x = 0; g.vx = Math.abs(g.vx); }
  if (g.x > 1) { g.x = 1; g.vx = -Math.abs(g.vx); }
  if (g.y < 0) { g.y = 0; g.vy = Math.abs(g.vy); }
  if (swan() < Math.min(1, D.swanP * Math.pow(g.speedMul, D.swanGrow))) {
    const a = Math.atan2(g.vy, g.vx) + (swan() - 0.5) * 1.2;
    g.vx = Math.cos(a); g.vy = Math.abs(Math.sin(a)) * (g.vy < 0 ? -1 : 1);
  }
  if (!(g.maxSeen >= 1)) g.maxSeen = 1;
  if (g.speedMul > g.maxSeen) g.maxSeen = g.speedMul;
  g.speedMul = Math.min((1 + g.frames * D.ramp) * Math.pow(D.hitBoost, g.hits) +
                        D.accel * g.frames * g.frames, D.maxSpeedMul);
  g.frames++;
}

function newAdvGame(rand) {
  const g = newGame(rand);
  g.ex = 0.42; g.enderHits = 0; g.boost = 1;
  return g;
}

function stepAdv(g, actS, actE, rand) {
  const D = DEFAULTS, swan = rand;
  if (g.frames % D.decisionInterval === 0) { g.hold = actS; g.holdE = actE; }
  g.ex = Math.max(0, Math.min(1 - D.paddleW, g.ex + (g.holdE || 0) * D.paddleSpeed));
  stepShared(g, rand, swan);
  if (g.vy < 0 && g.y <= 0.06) {
    const eff = effectivePaddle(g);
    if (g.x > eff.x && g.x < eff.x + eff.w) {
      g.vy = Math.abs(g.vy); g.enderHits++; g.boost *= 1.02;
      g.x = Math.max(0.02, Math.min(0.98, g.x));
    } else g.vy = Math.abs(g.vy); // clean escape past the ender
  }
  if (g.vy > 0 && g.y >= 0.94) {
    const eff = effectivePaddle(g);
    if (g.x > eff.x && g.x < eff.x + eff.w) {
      g.vy = -Math.abs(g.vy); g.hits++; g.boost *= D.hitBoost;
      g.x = Math.max(0.02, Math.min(0.98, g.x));
    } else return false; // death — the ender got its kill
  }
  return true;
}

function pick(o) { return o[0] > o[2] ? (o[0] > o[1] ? -1 : 0) : (o[2] > o[1] ? 1 : 0); }

// compete(survivor, ender, rand, opts) -> the arena-interface head-to-head.
// aFitness = survivor, bFitness = ender. Outcome vocabulary: "A-WINS" is the
// survivor reaching the frame cap, "B-WINS" is the ender's kill — the engine's
// loser-mutation keys off these strings.
function compete(sNet, eNet, rand, opts) {
  const cap = (opts && opts.maxFrames) || DEFAULTS.maxFrames;
  let g = newAdvGame(rand);
  while (g.frames < cap) {
    const os = forward(sNet, sense(g)), oe = forward(eNet, sense(g));
    if (!stepAdv(g, pick(os), pick(oe), rand)) break;
  }
  const reachedCap = g.frames >= cap;
  const aFitness = fitnessOf(g.frames, g.hits);
  const bFitness = reachedCap ? g.enderHits * 5 : (cap - g.frames) + g.enderHits * 30;
  return { aFitness, bFitness, frames: g.frames, hits: g.hits,
           enderHits: g.enderHits, maxSpeed: g.speedMul,
           outcome: reachedCap ? "A-WINS" : "B-WINS" };
}

const arena = {
  name: "pong-adversarial",
  DEFAULTS, HIT_WEIGHT, EFFECTIVE_MARGIN,
  makeNet, forward, mutate, fitnessOf, effectivePaddle, sense,
  newGame, newAdvGame, stepAdv, playAdv: compete, compete,
  aWins: "A-WINS", bWins: "B-WINS",
  netId,
  validate: (net) => !!(net && Array.isArray(net.w1) && Array.isArray(net.b1) &&
                          Array.isArray(net.w2) && Array.isArray(net.b2)),
};

module.exports = arena;
