#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  INBOUND MESSAGE GATE — check suite
//
//  Guards the replay gate that silently ate live traffic. The old
//  inline rule was
//
//      msgTimestamp < BOT_START_TIME - 60 || msgAgeSec > 120
//
//  and that second clause dropped any message older than two
//  minutes, whatever the reason. A live message carries the
//  timestamp the SENDER gave it, so delivery latency — a slow
//  reconnect, or a group whose sender key went stale after a
//  restart and had to be retried before Baileys would emit it —
//  made genuine messages look old. The bot answered the groups
//  that delivered instantly and stayed mute in the stale ones.
//
//  The rule that separates real traffic from a replay is age
//  RELATIVE TO BOOT, never age in general. Section B is the
//  regression: those cases all passed "looks old" and must still
//  be delivered.
//
//  Run:  node scripts/message_gate_check.js
// ══════════════════════════════════════════════════════════════
"use strict";

const path = require("path");
const { replayVerdict, isReplay, DROP } = require(path.join(__dirname, "..", "systems", "messageGate"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; failures.push(name + (detail ? `  — ${detail}` : "")); console.log(`❌ ${name}${detail ? "  — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

// A process that has been up for a while, so "late" is unambiguous.
const BOOT = 1_800_000_000;                 // Unix seconds
const NOW  = BOOT + 3 * 3600;               // 3 hours of uptime
const ago  = (sec) => NOW - sec;

section("A. live traffic is delivered");
check("a brand-new message is delivered", replayVerdict({ timestamp: NOW, bootTimeSec: BOOT, nowSec: NOW }) === null);
check("a message 5 seconds old is delivered", replayVerdict({ timestamp: ago(5), bootTimeSec: BOOT, nowSec: NOW }) === null);
check("a message 90 seconds old is delivered", replayVerdict({ timestamp: ago(90), bootTimeSec: BOOT, nowSec: NOW }) === null);

section("B. the age cap is gone — late delivery is not replay");
// Every case here was dropped by `msgAgeSec > 120` while the message was
// unquestionably live: it was sent AFTER this process started.
for (const mins of [5, 30, 120]) {
  const v = replayVerdict({ timestamp: ago(mins * 60), bootTimeSec: BOOT, nowSec: NOW });
  check(`a message sent ${mins} min ago but after boot is delivered`, v === null, v ? `dropped as ${v.reason}` : "");
}
check("a message delayed by a decryption retry is delivered", replayVerdict({ timestamp: ago(7 * 60), bootTimeSec: BOOT, nowSec: NOW }) === null);
check("a message that took an hour to arrive is delivered", replayVerdict({ timestamp: ago(3600), bootTimeSec: BOOT, nowSec: NOW }) === null);

section("C. replays are still dropped");
{
  const v = replayVerdict({ timestamp: BOOT - 10 * 60, bootTimeSec: BOOT, nowSec: NOW });
  check("a message from before boot is dropped", v != null, `got ${JSON.stringify(v)}`);
  check("...and says so as predates-boot", v?.reason === DROP.PREDATES_BOOT, `got ${v?.reason}`);
  check("a message from a day before boot is dropped", replayVerdict({ timestamp: BOOT - 86400, bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.PREDATES_BOOT);
  check("a history replay from last week is dropped", replayVerdict({ timestamp: BOOT - 7 * 86400, bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.PREDATES_BOOT);
}

section("D. boot slack is a grace window, not a second embargo");
check("a message sent 30s before boot is delivered (clock skew)", replayVerdict({ timestamp: BOOT - 30, bootTimeSec: BOOT, nowSec: NOW }) === null);
check("a message sent right at boot is delivered", replayVerdict({ timestamp: BOOT, bootTimeSec: BOOT, nowSec: NOW }) === null);
check("a message 61s before boot is dropped", replayVerdict({ timestamp: BOOT - 61, bootTimeSec: BOOT, nowSec: NOW }) != null);
check("the grace window is honoured when overridden", replayVerdict({ timestamp: BOOT - 300, bootTimeSec: BOOT, nowSec: NOW, graceSec: 600 }) === null);

section("E. unstamped messages are dropped");
check("timestamp 0 is dropped", replayVerdict({ timestamp: 0, bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.UNSTAMPED);
check("a missing timestamp is dropped", replayVerdict({ bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.UNSTAMPED);
check("null is dropped", replayVerdict({ timestamp: null, bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.UNSTAMPED);
check("undefined is dropped", replayVerdict({ timestamp: undefined, bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.UNSTAMPED);
check("NaN is dropped", replayVerdict({ timestamp: NaN, bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.UNSTAMPED);

section("F. the verdict never depends on how late it is");
{
  // The defining property of the fix: hold the send time fixed and walk the
  // delivery clock forward. Only the timestamp's relation to BOOT may matter.
  const sentAt = ago(10 * 60);
  const verdicts = [0, 60, 3600, 86400].map(extra =>
    replayVerdict({ timestamp: sentAt, bootTimeSec: BOOT, nowSec: NOW + extra }));
  check("the same message keeps its verdict as the clock advances", verdicts.every(v => v === null), JSON.stringify(verdicts));
  check("isReplay agrees with replayVerdict", isReplay({ timestamp: ago(3600), bootTimeSec: BOOT, nowSec: NOW }) === false
    && isReplay({ timestamp: BOOT - 3600, bootTimeSec: BOOT, nowSec: NOW }) === true);
}

section("G. junk input cannot throw");
check("no arguments at all", (() => { try { replayVerdict(); return true; } catch { return false; } })());
check("a string timestamp does not throw", (() => { try { replayVerdict({ timestamp: "x", bootTimeSec: BOOT, nowSec: NOW }); return true; } catch { return false; } })());
check("a string timestamp is treated as unstamped", replayVerdict({ timestamp: "x", bootTimeSec: BOOT, nowSec: NOW })?.reason === DROP.UNSTAMPED);
check("missing bootTimeSec does not throw", (() => { try { replayVerdict({ timestamp: NOW, nowSec: NOW }); return true; } catch { return false; } })());
check("a bogus graceSec falls back, it does not drop everything", replayVerdict({ timestamp: ago(5), bootTimeSec: BOOT, nowSec: NOW, graceSec: "nope" }) === null);

console.log("\n" + "─".repeat(48));
console.log(`Message gate: ${pass} passed / ${fail} failed`);
if (fail) { console.log("\nfailures:"); for (const f of failures) console.log("  ! " + f); process.exit(1); }
console.log("ALL GREEN");
