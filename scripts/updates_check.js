#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  .updates — check suite
//  Verifies the live-event panel, the version ladder and the
//  rendering guardrails (no literal \n leaking into the card).
//
//  Run:  node scripts/updates_check.js
// ══════════════════════════════════════════════════════════════
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const U    = require(path.join(ROOT, "systems", "updates.js"));
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "updates.json"), "utf8"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) pass++;
  else { fail++; failures.push(name + (detail ? `  — ${detail}` : "")); }
  console.log(`${cond ? "✅" : "❌"} ${name}`);
}
function section(t) { console.log(`\n── ${t} ──`); }

// counts literal backslash characters and real newlines in a string
function scan(s) {
  let backslash = 0, lf = 0;
  for (const ch of String(s || "")) {
    if (ch.charCodeAt(0) === 92) backslash++;
    if (ch.charCodeAt(0) === 10) lf++;
  }
  return { backslash, lf };
}

// ══════════════════════════════════════════════════════════════
section("A. module surface");
["load", "save", "cmdUpdate", "cmdUpdateRelease", "eventStatus", "renderEvent", "renderEvents"]
  .forEach(k => check(`exports ${k}`, typeof U[k] === "function"));

// ══════════════════════════════════════════════════════════════
section("B. event status");
const NOW = Date.parse("2026-10-05T12:00:00Z");
check("explicit status wins", U.eventStatus({ status: "live", startsAt: "2030-01-01T00:00:00Z" }, NOW) === "live");
check("before start = upcoming", U.eventStatus({ startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" }, NOW) === "upcoming");
check("inside window = live", U.eventStatus({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }, NOW) === "live");
check("after end = ended", U.eventStatus({ startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-10-01T00:00:00Z" }, NOW) === "ended");
check("no window defaults to live", U.eventStatus({}, NOW) === "live");

// ══════════════════════════════════════════════════════════════
section("C. event rendering");
const live = { name: "The Hollowing", subtitle: "seasonal", notes: "line one\nline two", stages: ["a", "b"], startsAt: "2026-10-04T00:00:00Z", endsAt: "2026-11-01T03:00:00Z" };
const r = U.renderEvent(live, NOW);
check("renders the uppercase name", r.includes("*THE HOLLOWING*"));
check("renders the subtitle", r.includes("_seasonal_"));
check("live shows the end date", /_Ends 2026-11-01_/.test(r));
check("renders every stage", r.includes("• a") && r.includes("• b"));
check("renders real line breaks, not literals", scan(live.notes).backslash === 0 && r.includes("line one\nline two"));
const upcoming = U.renderEvent({ name: "Later", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" }, NOW);
check("upcoming shows the start date", /_Starts 2026-12-01_/.test(upcoming));
// NOTE: compare code points, not [0] — both emoji share a UTF-16 high surrogate.
check("live render starts with the live icon", U.renderEvent(live, NOW).startsWith(U.EVENT_ICON.live));
check("upcoming render starts with the upcoming icon", upcoming.startsWith(U.EVENT_ICON.upcoming));
check("live and upcoming icons differ",
  [...U.EVENT_ICON.live][0] !== [...U.EVENT_ICON.upcoming][0]);

// ══════════════════════════════════════════════════════════════
section("D. event list filtering");
const mixed = { events: [live, { name: "Done", status: "ended" }, { name: "Soon", status: "upcoming" }] };
const list = U.renderEvents(mixed, NOW);
check("live event present", list.includes("THE HOLLOWING"));
check("upcoming event present", list.includes("SOON"));
check("ended event filtered out", !list.includes("DONE"));
check("no events = empty block (backwards compatible)", U.renderEvents({ current: {}, pending: {} }, NOW) === "");
check("missing events key is safe", U.renderEvents(null, NOW) === "");

// ══════════════════════════════════════════════════════════════
section("E. the shipped data");
const hyp = (DATA.events || []).find(e => e.id === "the-hollowing");
check("The Hollowing is present in updates.json", !!hyp);
check("The Hollowing is marked live", U.eventStatus(hyp, NOW) === "live");
check("its notes contain no literal backslash-n", scan(hyp && hyp.notes).backslash === 0, String(scan(hyp && hyp.notes).backslash));
check("its notes have real line breaks", scan(hyp && hyp.notes).lf >= 2);
check("it has stages", Array.isArray(hyp && hyp.stages) && hyp.stages.length >= 5, String((hyp && hyp.stages || []).length));
check("it tells players the commands",
  (hyp.stages || []).some(s => s.includes(".hollowing")) && (hyp.stages || []).some(s => s.includes(".investigate")));
check("the live event has a start and end", !!hyp.startsAt && !!hyp.endsAt);
check("event window contains launch day", Date.parse(hyp.startsAt) <= NOW && Date.parse(hyp.endsAt) > NOW);

check("version ladder preserved (current v1.2.6)", DATA.current && DATA.current.version === "1.2.6");
check("pending Sunday Gift preserved", DATA.pending && DATA.pending.version === "1.3.0");
check("history preserved", Array.isArray(DATA.history) && DATA.history.length === 2, String((DATA.history || []).length));

// every shipped note must render as real line breaks, not literals
const OFFENDERS = [];
for (const bucket of ["current", "pending"]) {
  if (DATA[bucket] && scan(DATA[bucket].notes).backslash) OFFENDERS.push(bucket);
}
for (const mk of ["stages"]) {
  for (const bucket of ["current", "pending"]) {
    const arr = DATA[bucket] && DATA[bucket][mk];
    if (Array.isArray(arr) && arr.some(s => scan(s).backslash)) OFFENDERS.push(`${bucket}.${mk}`);
  }
}
check("no shipped notes/stages contain literal \\n", OFFENDERS.length === 0, OFFENDERS.join(","));

// ══════════════════════════════════════════════════════════════
(async () => {
  section("F. .updates end to end");
  const sent = [];
  await U.cmdUpdate({ sock: { sendMessage: (c, p) => sent.push(p.text) } }, "g@g.us", {});
  const text = sent[0] || "";
  check("sends exactly one message", sent.length === 1);
  check("has the header", text.includes("*LUMORA UPDATES*"));
  // NOTE: indexOf returns -1 when absent, and -1 < n is always true — so the
  // presence must be asserted explicitly or these ordering checks pass on a
  // card with no event panel at all.
  const iEvent   = text.indexOf("THE HOLLOWING");
  const iCurrent = text.indexOf("CURRENT — v1.2.6");
  const iPending = text.indexOf("PENDING — v1.3.0");
  check("event panel is actually present", iEvent >= 0);
  check("leads with the live event", iEvent >= 0 && iCurrent > iEvent);
  check("event panel comes before pending", iEvent >= 0 && iPending > iEvent);
  check("still shows the current version", text.includes("*CURRENT — v1.2.6*"));
  check("still shows the pending version", text.includes("*PENDING — v1.3.0*"));
  check("keeps the closing hint", text.includes(".update or .updates"));
  check("no literal backslash-n in the rendered card", scan(text).backslash === 0, String(scan(text).backslash));
  check("card is a reasonable length", text.length < 6000, String(text.length));

  console.log(`\n${"─".repeat(48)}`);
  console.log(`Updates: ${pass} passed / ${fail} failed`);
  if (failures.length) { console.log("Failures:"); for (const f of failures) console.log("  ✗ " + f); }
  console.log(fail === 0 ? "ALL GREEN" : "RED");
  process.exit(fail === 0 ? 0 : 1);
})();
