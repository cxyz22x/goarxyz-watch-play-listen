import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// extract the guard from a freshly encrypted stub and run it in a sandbox
// for 45 simulated seconds of intervals, asserting no wipe fires.
const stub = readFileSync("public/index.html", "utf8");
const gStart = stub.indexOf("(function(){");
const gEnd = stub.indexOf("})();", gStart) + 5;
const guard = stub.slice(gStart, gEnd);
assert.ok(guard.includes("wipe"), "guard found");

// sandbox browser-ish environment: normal window, no devtools signs
let innerHTML = "<html>content</html>";
let location = { replace: (u) => { globalThis.__replaced = u; } };
let localStorageStore = {};
const timers = [];

globalThis.window = globalThis;
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = { clear: () => { globalThis.__cleared = true; } };
globalThis.document = {
  documentElement: {
    get innerHTML() { return innerHTML; },
    set innerHTML(v) { innerHTML = v; globalThis.__wiped = true; },
  },
  addEventListener: () => {},
};
globalThis.location = location;
globalThis.outerWidth = 1200;
globalThis.innerWidth = 1180;
globalThis.outerHeight = 800;
globalThis.innerHeight = 780;

// capture setInterval calls so we can run them manually many times
const origSetInterval = globalThis.setInterval;
let intervalFns = [];
globalThis.setInterval = (fn, ms) => { intervalFns.push({ fn, ms }); return 1; };
delete globalThis.__wiped;
delete globalThis.__cleared;
delete globalThis.__replaced;

eval(guard);

assert.ok(intervalFns.length >= 1, "guard registered interval(s)");

// simulate 60 ticks (guard runs every 1.5s → 90 seconds of page life)
for (const { fn } of intervalFns) {
  for (let t = 0; t < 60; t++) fn();
}

assert.ok(!globalThis.__wiped, "page content must never be wiped in normal browsing");
assert.ok(!globalThis.__cleared, "localStorage must not be cleared");
assert.ok(!globalThis.__replaced, "location must not be redirected");
console.log(`survived ${intervalFns.length} interval(s) × 60 ticks — no wipe`);

// now verify devtools detection DOES still fire: docked devtools = innerWidth much smaller
globalThis.innerWidth = 700;
globalThis.innerHeight = 500;
for (const { fn } of intervalFns) fn();
assert.ok(globalThis.__wiped, "devtools detection must still fire");
console.log("devtools dock still detected — wipe fires correctly");
