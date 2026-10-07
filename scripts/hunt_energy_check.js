#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  HUNT ENERGY — check suite
//
//  Guards the fast refill that silently never ran. The original bug
//  read `now` before its `const` declaration (temporal dead zone) and
//  a bare `catch {}` swallowed the ReferenceError, so the 3-minute
//  cadence was dead for every player and nobody could see it.
//
//  Runs against a TEMP config — never touches data/hollowing_config.json.
//
//  Run:  node scripts/hunt_energy_check.js
// ══════════════════════════════════════════════════════════════
"use strict";

const fs   = require("fs");
const os   = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const hunting   = require(path.join(ROOT, "systems", "hunting"));
const hollowing = require(path.join(ROOT, "systems", "hollowing"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? `  — ${detail}` : "")); console.log(`❌ ${name}${detail ? "  — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

// ── time control ────────────────────────────────────────────────
const realNow = Date.now;
const T0 = Date.parse("2026-10-07T00:00:00Z");
let clock = T0;
Date.now = () => clock;
const atMin = (m) => { clock = T0 + m * 60000; };

// ── temp config (the real file is never written to) ─────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hunt-energy-"));
function writeConfig(over) {
  fs.writeFileSync(path.join(dir, "hollowing_config.json"), JSON.stringify({
    enabled: true,
    // event live across the whole test window
    startDate: new Date(T0 - 7 * 864e5).toISOString(),
    endDate:   new Date(T0 + 30 * 864e5).toISOString(),
    eventModifiers: {
      huntEnergyActiveRefillIntervalMs: 180000,   // 3 minutes
      huntEnergyActiveRefillAmount: 50,
    },
    huntEnergyBurst: false,                        // so the cadence is observable
    ...over,
  }, null, 2));
}

const fresh = (energy = 0, max = 200) => ({ maxHuntEnergy: max, huntEnergy: energy, lastHuntRefill: T0 });
const after = (player, min) => { atMin(min); hunting.regenHuntEnergy(player); return player.huntEnergy; };

try {
  hollowing.configure({ dir });

  // ════════════════════════════════════════════════════════════
  section("A. the temporal dead zone that killed it");
  // Reproduces the original shape exactly: reading `now` before its `const`
  // declaration throws, which is what the swallowed catch was hiding.
  const tdz = (() => {
    try {
      if (true) { const _ = 100 - now; return "no throw"; }
    } catch (e) { return e.constructor.name + ": " + e.message; }
    const now = 0;
    return "no throw";
  })();
  check("reading `now` before its `const` throws ReferenceError", /^ReferenceError/.test(tdz), tdz);

  // ════════════════════════════════════════════════════════════
  section("B. the fast cadence actually refills");
  writeConfig({});
  check("the event is live at the test time", hollowing.isActive(hollowing.loadConfig(), T0));
  const rc = hollowing.huntEnergyActiveRecharge(hollowing.loadConfig(), T0);
  check("an active refill cadence is configured", !!rc && rc.intervalMs === 180000 && rc.amount === 50,
    JSON.stringify(rc));

  const p = fresh(0);
  check("nothing has refilled before the first interval", after(p, 2) === 0, String(p.huntEnergy));
  check("+50 at 3 minutes",  after(p, 3)  === 50,  String(p.huntEnergy));
  check("nothing extra mid-interval", after(p, 5) === 50, String(p.huntEnergy));
  check("+50 at 6 minutes",  after(p, 6)  === 100, String(p.huntEnergy));
  check("+50 at 9 minutes",  after(p, 9)  === 150, String(p.huntEnergy));
  check("full at 12 minutes", after(p, 12) === 200, String(p.huntEnergy));
  check("the gauge never exceeds max", after(p, 40) === 200, String(p.huntEnergy));

  // ════════════════════════════════════════════════════════════
  section("C. catch-up after an absence");
  const away = fresh(0);
  check("30 minutes away refills to full, not a single tick", after(away, 30) === 200, String(away.huntEnergy));

  const partial = fresh(0, 1000);          // room to see exact payouts
  check("10 minutes away pays 3 whole intervals", after(partial, 10) === 150, String(partial.huntEnergy));
  check("the clock advanced by whole intervals only",
    partial.lastHuntRefill === T0 + 3 * 180000, String(partial.lastHuntRefill - T0));

  // ════════════════════════════════════════════════════════════
  section("D. the other paths are untouched");
  writeConfig({ huntEnergyBurst: true });
  const burst = fresh(7);
  check("burst pins the gauge to max", (atMin(1), hunting.regenHuntEnergy(burst), burst.huntEnergy) === 200,
    String(burst.huntEnergy));

  writeConfig({ startDate: new Date(T0 + 400 * 864e5).toISOString() });   // event off
  const off = fresh(0);
  check("event off falls back to 6-hour regen", after(off, 6 * 60) === 100, String(off.huntEnergy));
  const offEarly = fresh(0);
  check("event off does not refill early", after(offEarly, 60) === 0, String(offEarly.huntEnergy));

  // ════════════════════════════════════════════════════════════
  section("E. a dead refill cannot hide again");
  const src = fs.readFileSync(path.join(ROOT, "systems", "hunting.js"), "utf8");
  check("the clock is declared before the fast-refill blocks",
    src.indexOf("const now  = Date.now()") < src.indexOf("huntEnergyActiveRechargeNow()"));
  check("the refill errors are logged, not swallowed",
    /catch \(e\) \{ console\.log\("\[hunting\] active regen:/.test(src));
} finally {
  Date.now = realNow;
  hollowing.resetPaths();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

console.log(`\n${"─".repeat(48)}`);
console.log(`Hunt energy: ${pass} passed / ${fail} failed`);
if (failures.length) { console.log("Failures:"); for (const f of failures) console.log("  ✗ " + f); }
console.log(fail === 0 ? "ALL GREEN" : "RED");
process.exit(fail === 0 ? 0 : 1);
