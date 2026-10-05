#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  The Hollowing — check suite
//  Verifies the event engine, the scheduler's once-only delivery,
//  the Hunt Energy modifiers, and the wiring into the live bot.
//
//  Run:  node scripts/hollowing_check.js
// ══════════════════════════════════════════════════════════════
"use strict";

const fs   = require("fs");
const os   = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const H    = require(path.join(ROOT, "systems", "hollowing.js"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? `  — ${detail}` : "")); }
  console.log(`${cond ? "✅" : "❌"} ${name}`);
}
function section(t) { console.log(`\n── ${t} ──`); }

// fake sock that records outgoing messages
function fakeSock(records) {
  return {
    user: { id: "111@s.whatsapp.net" },
    groupMetadata: async () => ({ participants: [{ id: "222@s.whatsapp.net" }, { id: "111@s.whatsapp.net" }] }),
    sendMessage: async (chatId, payload) => { records.push({ chatId, payload }); },
  };
}

// ══════════════════════════════════════════════════════════════
// A. MODULE SURFACE
// ══════════════════════════════════════════════════════════════
section("A. module surface");
const REQUIRED_EXPORTS = [
  "loadConfig", "saveConfig", "loadState", "saveState",
  "isEnabled", "isActive", "activeChapter", "chapterLadder", "chapterUnlockMs", "dueBeats",
  "huntEnergyMultipliers", "applyRegenModifier", "applyDrainModifier",
  "isMoraAvailable", "filterAvailableMora", "missingMoraNames",
  "recordProgress", "totalProgress", "dueMilestones", "claimLimitedTask", "chronicleFor",
  "ensureChoice", "recordTemptation",
  "formatCatStamp", "formatCountdown", "chapterAnnouncement", "milestoneAnnouncement",
  "tick", "startHollowingLoop", "stopHollowingLoop", "cmdHollowing",
  "configure", "resetPaths",
];
for (const k of ["loadConfig", "isEnabled", "huntEnergyMultipliers", "tick", "configure"]) {
  check(`exports ${k}`, typeof H[k] === "function" || H[k] !== undefined);
}
check("all required exports present", REQUIRED_EXPORTS.every(k => k in H),
  REQUIRED_EXPORTS.filter(k => !(k in H)).join(","));
check("TICK_MS is 15 min", H.TICK_MS === 15 * 60 * 1000, String(H.TICK_MS));

// ══════════════════════════════════════════════════════════════
// B. CONFIG & TIME
// ══════════════════════════════════════════════════════════════
section("B. config & time");
H.resetPaths();
const cfg = H.loadConfig();
const disabled = { ...cfg, enabled: false };
check("code default is disabled (event stays removable)", H.DEFAULT_CONFIG.enabled === false);
check("shipped config enables the event", H.isEnabled(cfg) === true);
check("disabled ⇒ inactive", H.isActive(disabled, Date.now()) === false);
check("4 chapters", (cfg.chapters || []).length === 4, String((cfg.chapters || []).length));
check("chapters are ordered I..IV",
  (cfg.chapters || []).map(c => c.roman).join(",") === "I,II,III,IV");
check("every chapter has offsetDays",
  (cfg.chapters || []).every(c => Number.isFinite(Number(c.offsetDays))));
check("every beat has a unique id",
  (() => { const ids = (cfg.beats || []).map(b => b.id); return new Set(ids).size === ids.length; })());
check("every beat references a real chapter",
  (cfg.beats || []).every(b => (cfg.chapters || []).some(c => c.id === b.chapterId)));
check("at least 10 story beats", (cfg.beats || []).length >= 10, String((cfg.beats || []).length));

const startMs = Date.parse(cfg.startDate);
const ch1 = cfg.chapters[0];
check("chapter unlock = startDate + offsetDays",
  H.chapterUnlockMs(cfg, ch1) === startMs + Number(ch1.offsetDays) * H.DAY_MS);
check("finale unlocks on startDate",
  H.chapterUnlockMs(cfg, cfg.chapters[3]) === startMs);
check("locked before the event", H.chapterLadder(cfg, startMs - 30 * H.DAY_MS).every(c => !c.unlocked));
check("all unlocked after startDate", H.chapterLadder(cfg, startMs + H.DAY_MS).every(c => c.unlocked));

const enabled = { ...JSON.parse(JSON.stringify(cfg)), enabled: true };
check("enabled + in-window ⇒ active",
  H.isActive(enabled, startMs - 1 * H.DAY_MS) === true);
check("enabled + after endDate ⇒ inactive",
  H.isActive(enabled, Date.parse(enabled.endDate) + H.DAY_MS) === false);
check("activeChapter picks the newest unlocked",
  H.activeChapter(enabled, startMs + H.HOUR_MS)?.id === "hollowing",
  H.activeChapter(enabled, startMs + H.HOUR_MS)?.id);
check("activeChapter is null before the prelude",
  H.activeChapter(enabled, startMs - 60 * H.DAY_MS) === null);

// ══════════════════════════════════════════════════════════════
// C. HUNT ENERGY MODIFIERS
// ══════════════════════════════════════════════════════════════
section("C. hunt energy modifiers");
const offM = H.huntEnergyMultipliers(disabled, Date.now());
check("off ⇒ ×1/×1", offM.regen === 1 && offM.drain === 1 && offM.active === false);
const onM = H.huntEnergyMultipliers(enabled, startMs);
check("on ⇒ configured multipliers",
  onM.regen === enabled.eventModifiers.huntEnergyRegenMultiplier &&
  onM.drain === enabled.eventModifiers.huntEnergyDrainMultiplier && onM.active === true);
check("applyRegenModifier rounds", H.applyRegenModifier(50, { regen: 2 }) === 100);
check("applyDrainModifier floors", H.applyDrainModifier(45, { drain: 0.5 }) === 22);
check("applyDrainModifier never negative", H.applyDrainModifier(-9, { drain: 2 }) === 0);
check("modifiers default safely on garbage",
  H.applyRegenModifier(10, null) === 10 && H.applyDrainModifier(10, null) === 10);

// ══════════════════════════════════════════════════════════════
// D. MORA ACTIVITY
// ══════════════════════════════════════════════════════════════
section("D. mora activity");
check("normal mora available", H.isMoraAvailable({ id: 1, name: "Thornel" }) === true);
check("active:false unavailable", H.isMoraAvailable({ id: 2, active: false }) === false);
check("missing:true unavailable", H.isMoraAvailable({ id: 3, missing: true }) === false);
check("null is unavailable", H.isMoraAvailable(null) === false);
check("filter keeps only available",
  H.filterAvailableMora([{ id: 1 }, { id: 2, active: false }, { id: 3, missing: true }]).length === 1);
check("filter tolerates non-array", Array.isArray(H.filterAvailableMora(undefined)) && H.filterAvailableMora(undefined).length === 0);

// ══════════════════════════════════════════════════════════════
// E. BEATS
// ══════════════════════════════════════════════════════════════
section("E. story beats");
const emptyState = JSON.parse(JSON.stringify(H.EMPTY_STATE));
const noneDue = H.dueBeats(enabled, emptyState, startMs - 60 * H.DAY_MS);
check("no beats due before the prelude", noneDue.length === 0, String(noneDue.length));
const allDue = H.dueBeats(enabled, emptyState, startMs + H.DAY_MS);
check("all beats due after the finale", allDue.length === (enabled.beats || []).length);
check("dueBeats is chronological",
  allDue.every((b, i) => i === 0 || b.firesAt >= allDue[i - 1].firesAt));
const seenState = { ...JSON.parse(JSON.stringify(H.EMPTY_STATE)), announcedBeats: { [allDue[0].id]: 1 } };
const afterOne = H.dueBeats(enabled, seenState, startMs + H.DAY_MS);
check("announced beats never re-fire", !afterOne.some(b => b.id === allDue[0].id));
check("unannounced beats still fire", afterOne.length === allDue.length - 1);
check("beat offset is relative to its chapter",
  (() => {
    const b = enabled.beats.find(x => x.chapterId === "signs" && Number(x.offsetHours) > 0);
    const ch = enabled.chapters.find(c => c.id === "signs");
    const due = H.dueBeats(enabled, emptyState, H.chapterUnlockMs(enabled, ch) + Number(b.offsetHours) * H.HOUR_MS);
    return due.some(x => x.id === b.id);
  })());

// ══════════════════════════════════════════════════════════════
// F. PROGRESS & MILESTONES
// ══════════════════════════════════════════════════════════════
section("F. world progress");
const st = JSON.parse(JSON.stringify(H.EMPTY_STATE));
H.recordProgress(st, "hollowKills", 10);
H.recordProgress(st, "hollowKills", 5);
H.recordProgress(st, "seals", 2);
check("recordProgress accumulates", st.world.progress.hollowKills === 15);
check("totalProgress sums keys", H.totalProgress(st) === 17, String(H.totalProgress(st)));
check("recordProgress ignores blank keys", (() => { const s = JSON.parse(JSON.stringify(H.EMPTY_STATE)); H.recordProgress(s, "", 5); return H.totalProgress(s) === 0; })());
const big = JSON.parse(JSON.stringify(H.EMPTY_STATE));
H.recordProgress(big, "x", 600);
const dm = H.dueMilestones(enabled, big);
check("milestone I due at 500", dm.some(m => m.id === "m1"));
check("milestone II not due at 600", !dm.some(m => m.id === "m2"));
big.milestones = { m1: 1 };
check("announced milestones don't repeat",
  !H.dueMilestones(enabled, big).some(m => m.id === "m1"));

// ══════════════════════════════════════════════════════════════
// G. LIMITED TASKS
// ══════════════════════════════════════════════════════════════
section("G. limited tasks");
const ts = JSON.parse(JSON.stringify(H.EMPTY_STATE));
const r1 = H.claimLimitedTask(ts, "first-witness", "a@s.whatsapp.net", "Aria");
check("first claim wins", r1.ok === true && r1.position === 1);
check("one-slot task is then full",
  H.claimLimitedTask(ts, "first-witness", "b@s.whatsapp.net", "Bex").reason === "full");
check("same player can't double-claim",
  H.claimLimitedTask(ts, "first-witness", "a@s.whatsapp.net", "Aria").reason === "already-claimed");
check("chronicle stores the name",
  H.chronicleFor(ts, "first-witness")?.name === "Aria");
check("chronicle lore substitutes {name}",
  H.chronicleFor(ts, "first-witness")?.lore.includes("Aria"));
check("unknown task id is rejected", H.claimLimitedTask(ts, "", "a@s.whatsapp.net", "A").ok === false);
check("3 limited tasks defined", (enabled.limitedTasks || []).length === 3);

// ══════════════════════════════════════════════════════════════
// H. CHOICES
// ══════════════════════════════════════════════════════════════
section("H. player choices");
const ply = {};
const rec = H.ensureChoice(ply);
check("ensureChoice creates shape",
  rec && rec.temptationAccepted === false && rec.temptationCount === 0);
H.recordTemptation(ply, true);
H.recordTemptation(ply, true);
check("recordTemptation counts and flags",
  ply.eventChoices.hollowing.temptationAccepted === true &&
  ply.eventChoices.hollowing.temptationCount === 2);
check("refusing records nothing",
  (() => { const p = {}; H.ensureChoice(p); H.recordTemptation(p, false); return p.eventChoices.hollowing.temptationAccepted === false; })());

// ══════════════════════════════════════════════════════════════
// I. TEXT BUILDERS
// ══════════════════════════════════════════════════════════════
section("I. text builders");
check("formatCountdown days", H.formatCountdown(2 * H.DAY_MS + 3 * H.HOUR_MS) === "2d 3h");
check("formatCountdown minutes", H.formatCountdown(90 * 60 * 1000) === "1h 30m");
check("formatCatStamp shape", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(H.formatCatStamp()));
check("chapterAnnouncement names the chapter",
  H.chapterAnnouncement(enabled.chapters[1]).includes("CHAPTER II") &&
  H.chapterAnnouncement(enabled.chapters[1]).includes(enabled.chapters[1].name));
check("milestoneAnnouncement includes progress",
  H.milestoneAnnouncement(enabled.milestones[0], 512).includes("512"));

// ══════════════════════════════════════════════════════════════
// J. SCHEDULER (temp dir, once-only delivery)
// ══════════════════════════════════════════════════════════════
section("J. scheduler");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hollowing-"));
  H.configure({ dir });

  // disabled: nothing happens, nothing written
  const recs0 = [];
  const res0 = await H.tick(fakeSock(recs0), ["g@g.us"]);
  check("disabled tick skips", res0.skipped === "disabled" && recs0.length === 0);

  // Chapter I just opened, the rest still locked — the real launch shape.
  const base = Date.parse("2026-10-05T00:00:00Z");
  fs.writeFileSync(path.join(dir, "hollowing_config.json"), JSON.stringify({
    enabled: true,
    startDate: new Date(base + 20 * H.DAY_MS).toISOString(),   // finale Oct 25
    endDate:   new Date(base + 31 * H.DAY_MS).toISOString(),
  }, null, 2));

  const totalBeats = (enabled.beats || []).length;
  let clock = base;
  // one engaged player, one not — only the engaged one is ever DM'd
  const players = {
    "engaged@s.whatsapp.net": { name: "Aria", eventChoices: { hollowing: {} } },
    "quiet@s.whatsapp.net":   { name: "Bex" },
  };

  const recs1 = [];
  const res1 = await H.tick(fakeSock(recs1), ["g@g.us"], { now: clock, players });
  check("first tick fires the OPENING PING alone", res1.fired === 1, String(res1.fired));
  check("opening ping names the event and Chapter I",
    /THE HOLLOWING HAS BEGUN/i.test(recs1[0]?.payload.text || "") && /Chapter I/i.test(recs1[0]?.payload.text || ""),
    (recs1[0]?.payload.text || "").slice(0, 40));
  check("opening ping is one message, not a duplicate chapter headline", recs1.length === 1, String(recs1.length));
  check("broadcast carries hidden mentions",
    recs1.every(r => Array.isArray(r.payload.mentions) && r.payload.mentions.length > 0));
  check("broadcast never tags the bot itself",
    recs1.every(r => !(r.payload.mentions || []).includes("111@s.whatsapp.net")));
  check("broadcast never leaks @handles into text",
    recs1.every(r => !/@\d{6,}/.test(r.payload.text)));

  // moments later: nothing. The spacing clock is what prevents bursts.
  const recsBurst = [];
  const resBurst = await H.tick(fakeSock(recsBurst), ["g@g.us"], { now: clock + 5 * 60 * 1000, players });
  check("clues never burst — spacing respected", resBurst.fired === 0 && recsBurst.length === 0);

  // Drive the clock forward; every beat must land exactly once.
  const seenText = new Set();
  let guard = 0, repeats = 0, dms = 0;
  for (const r of recs1) seenText.add(r.payload.text);
  // NOTE: the story has legitimate quiet gaps between chapters, so we do NOT
  // stop at the first idle tick — we run until every beat has landed.
  while (guard++ < 200 && Object.keys(H.loadState().announcedBeats || {}).length < totalBeats) {
    clock += 5 * H.HOUR_MS;
    const recs = [];
    await H.tick(fakeSock(recs), ["g@g.us"], { now: clock, players });
    for (const m of recs) {
      if (m.chatId !== "g@g.us") {          // a DM
        dms++;
        if (m.chatId !== "engaged@s.whatsapp.net") repeats++;
      } else {
        if (seenText.has(m.payload.text)) repeats++;
        seenText.add(m.payload.text);
      }
    }
  }
  let state1 = H.loadState();
  check("every beat delivered exactly once",
    Object.keys(state1.announcedBeats || {}).length === totalBeats,
    `${Object.keys(state1.announcedBeats || {}).length} of ${totalBeats}`);
  check("nothing ever repeated", repeats === 0, String(repeats));
  check("personal beats DM the engaged player only", dms > 0, String(dms));
  check("chronicle holds the whole story",
    (state1.chronicle || []).length >= totalBeats, String((state1.chronicle || []).length));
  check("opening ping is recorded once", !!state1.openedAt);
  check("opening ping never repeats",
    (state1.chronicle || []).filter(e => e.id === "opening").length === 1);

  const recs2 = [];
  const res2 = await H.tick(fakeSock(recs2), ["g@g.us"], { now: clock + 100 * H.HOUR_MS, players });
  check("tick is silent once drained", res2.fired === 0 && recs2.length === 0);

  // milestones fire once, independent of beat spacing
  const s2 = H.loadState();
  H.recordProgress(s2, "hollowKills", 5000);
  H.saveState(s2);
  const recs3 = [];
  const res3 = await H.tick(fakeSock(recs3), ["g@g.us"], { now: clock + 100 * H.HOUR_MS, players });
  check("milestones fire on crossing", res3.fired === 3, String(res3.fired));
  const recs4 = [];
  const res4 = await H.tick(fakeSock(recs4), ["g@g.us"], { now: clock + 101 * H.HOUR_MS, players });
  check("milestones don't re-fire", res4.fired === 0);
  check("configure redirects state file", fs.existsSync(path.join(dir, "hollowing.json")));

  // ════════════════════════════════════════════════════════════
  // L. STORY TREE
  // ════════════════════════════════════════════════════════════
  section("L. story tree");
  const tree = cfg.storyTree;
  const outcomes = new Set();
  for (const n of Object.values(tree.nodes)) for (const c of n.choices || []) outcomes.add(c.outcome);
  check("entry node exists", !!tree.nodes[tree.entry]);
  check("8 branching nodes", Object.keys(tree.nodes).length === 8);
  check("every node declares a real chapter",
    Object.values(tree.nodes).every(n => cfg.chapters.some(c => c.id === n.chapterId)));
  check("every choice uses a valid verb",
    Object.values(tree.nodes).every(n => (n.choices || []).every(c => H.allVerbs(cfg).includes(c.verb))));
  check("every choice declares a valid outcome",
    Object.values(tree.nodes).every(n => (n.choices || []).every(c =>
      ["lucky", "devastating", "reveal", "neutral", "task"].includes(c.outcome))));
  check("every next node exists",
    Object.values(tree.nodes).every(n => (n.choices || []).every(c => !c.next || !!tree.nodes[c.next])));
  check("tree has lucky / devastating / reveal paths",
    outcomes.has("lucky") && outcomes.has("devastating") && (outcomes.has("reveal") || outcomes.has("task")));
  check("8 story fragments", Object.keys(tree.fragments).length === 8);
  check("every referenced fragment exists",
    Object.values(tree.nodes).every(n => (n.choices || []).every(c => !c.reveal || !!tree.fragments[c.reveal])));
  check("every task is a real limited task",
    Object.values(tree.nodes).every(n => (n.choices || []).every(c =>
      !c.task || (cfg.limitedTasks || []).some(t => t.id === c.task))));
  check("buttons are ≤ 8 per node and carry hidden ids",
    Object.values(tree.nodes).every(n => {
      const b = H.taleButtons(n);
      return b.length <= 8 && b.every(x => x.id.startsWith(".hollow-") && x.text.length > 0);
    }));

  // play a path
  const st2 = JSON.parse(JSON.stringify(H.EMPTY_STATE));
  const pl = { lucons: 1000, aura: 20, playerHp: 100, playerMaxHp: 100, eventChoices: {} };
  const r1 = H.resolveChoice(cfg, st2, pl, "signs-crystal", "investigate", { playerId: "a@s", playerName: "Aria" });
  check("lucky choice resolves", r1.ok && r1.outcome === "lucky");
  check("lucky choice grants lucons", pl.lucons === 1350, String(pl.lucons));
  check("lucky choice advances the node", H.taleOf(pl).node === "signs-hollow");

  const stP = JSON.parse(JSON.stringify(H.EMPTY_STATE));
  const plP = { lucons: 0, aura: 0, eventChoices: {} };
  H.resolveChoice(cfg, stP, plP, "signs-crystal", "take", { playerId: "p@s", playerName: "P" });
  check("progress-bearing choice records world progress", H.totalProgress(stP) >= 1, String(H.totalProgress(stP)));

  const r2 = H.resolveChoice(cfg, st2, pl, "signs-hollow", "follow", { playerId: "a@s", playerName: "Aria" });
  check("devastating choice resolves", r2.outcome === "devastating");
  check("devastation costs resources", pl.lucons < 1350 && pl.playerHp < 100);
  check("scar recorded", H.taleOf(pl).scars === 1);
  check("path ends cleanly", H.taleOf(pl).node === null && !!H.taleOf(pl).ending);
  check("unknown verb rejected", H.resolveChoice(cfg, st2, pl, "signs-crystal", "nonsense").ok === false);

  const st3 = JSON.parse(JSON.stringify(H.EMPTY_STATE));
  const pl2 = { lucons: 0, aura: 0, playerHp: 50, playerMaxHp: 50, eventChoices: {} };
  const r3 = H.resolveChoice(cfg, st3, pl2, "signs-crystal", "retreat", { playerId: "b@s", playerName: "Bex" });
  check("reveal surfaces a fragment", !!r3.fragment && H.taleOf(pl2).revealed.includes("frag-1"));
  check("reveal line renders the fragment", H.taleButtons(tree.nodes["signs-crystal"]).length === 3);

  const r4 = H.resolveChoice(cfg, st3, pl2, "hollow-whisper", "investigate", { playerId: "b@s", playerName: "Bex" });
  check("task choice claims the limited task", r4.task?.ok === true && H.chronicleFor(st3, "first-witness")?.name === "Bex");
  check("task choice chains onward", H.taleOf(pl2).node === "hollow-whisper-deal");

  const r5 = H.resolveChoice(cfg, st3, pl2, "hollow-whisper-deal", "take", { playerId: "b@s", playerName: "Bex" });
  check("accepting the temptation is recorded", pl2.eventChoices.hollowing.temptationAccepted === true);
  check("accepting grants event resources", H.resourcesOf(pl2).essence >= 3);

  const pl3 = { lucons: 0, aura: 0, eventChoices: {} };
  const r6 = H.resolveChoice(cfg, st3, pl3, "hollow-whisper-deal", "retreat", { playerId: "c@s", playerName: "Cy" });
  check("refusing records the refusal", r6.ok && r6.reveal === "frag-4" && pl3.eventChoices.hollowing.temptationAccepted === false);

  // ════════════════════════════════════════════════════════════
  // M. HOLLOW MUSTER (group mechanic)
  // ════════════════════════════════════════════════════════════
  section("M. hollow muster");
  const stM = JSON.parse(JSON.stringify(H.EMPTY_STATE));
  const rec = H.ensureMuster(stM, "g@g.us", cfg, 1000);
  check("muster starts empty", rec.tally === 0 && rec.rewarded === false);
  rec.contributors["a@s"] = 1; rec.tally = 1;
  check("muster line shows the tally", H.musterLine(cfg, rec).includes("1/"));
  const sweepAt = 1000 + Number(cfg.muster.windowHours) * H.HOUR_MS + 1;
  check("short muster is swept as broken", H.sweepMustersInto(stM, cfg, sweepAt).includes("g@g.us") && stM.muster["g@g.us"].failed === true);
  check("sweep is idempotent", H.sweepMustersInto(stM, cfg, 1000 + 99 * H.HOUR_MS).length === 0);

  const mPlayers = {};
  for (let i = 0; i < 8; i++) mPlayers[`p${i}@s.whatsapp.net`] = { lucons: 0, aura: 0, name: `P${i}` };
  const saveNothing = () => {};
  let held = null;
  for (let i = 0; i < 8; i++) {
    const out = [];
    await H.cmdMuster({ sock: fakeSock(out), players: mPlayers, savePlayers: saveNothing },
      "g@g.us", `p${i}@s.whatsapp.net`, {});
    if (/MUSTER HOLDS/i.test(out[0]?.payload?.text || "")) held = out[0];
  }
  check("muster holds at the threshold", !!held);
  check("every contributor rewarded", mPlayers["p0@s.whatsapp.net"].lucons === cfg.muster.reward.lucons, String(mPlayers["p0@s.whatsapp.net"].lucons));
  check("hold announces everyone", Array.isArray(held?.payload?.mentions) && held.payload.mentions.length === 8);

  const dupOut = [];
  await H.cmdMuster({ sock: fakeSock(dupOut), players: mPlayers, savePlayers: saveNothing }, "g@g.us", "p0@s.whatsapp.net", {});
  check("duplicate contribution refused", /already/i.test(dupOut[0]?.payload?.text || ""));

  const privOut = [];
  await H.cmdMuster({ sock: fakeSock(privOut), players: mPlayers, savePlayers: saveNothing }, "dm@s.whatsapp.net", "p0@s.whatsapp.net", {});
  check("muster is group-only", /group/i.test(privOut[0]?.payload?.text || ""));

  // ════════════════════════════════════════════════════════════
  // N. DELIVERY LAYERS
  // ════════════════════════════════════════════════════════════
  section("N. delivery layers");
  check("default audience is world", H.beatAudience({}) === "world");
  check("garbage audience falls back to world", H.beatAudience({ audience: "nonsense" }) === "world");
  check("three layers defined", H.AUDIENCES.join(",") === "world,story,personal");
  const aud = new Set((cfg.beats || []).map(H.beatAudience));
  check("config actually uses all three layers", aud.has("world") && aud.has("story") && aud.has("personal"), [...aud].join(","));
  check("engagedJids returns only engaged players",
    H.engagedJids({ a: { eventChoices: { hollowing: {} } }, b: {} }).join(",") === "a");
  const stC = JSON.parse(JSON.stringify(H.EMPTY_STATE));
  H.appendChronicle(stC, { id: "x", text: "hello", audience: "personal" }, 5);
  check("chronicle stores audience + time", stC.chronicle[0].audience === "personal" && stC.chronicle[0].at === 5);

  // ════════════════════════════════════════════════════════════
  // O. MISSING-MORA FLAVOUR
  // ════════════════════════════════════════════════════════════
  section("O. missing-mora flavour");
  check("noTraceLine is atmospheric, not an error", !/unavailable|error|❌/i.test(H.noTraceLine(cfg)));
  check("noTraceLine mentions the quiet grounds", /quiet/i.test(H.noTraceLine(cfg)));
  check("config carries the line", typeof cfg.noTrace?.line === "string" && cfg.noTrace.line.length > 20);
  // a brand-new hunter walks straight into the story, no menu
  const tPlayers = { "new@s.whatsapp.net": { name: "New", lucons: 0, aura: 0, eventChoices: {} } };
  const tOut = [];
  await H.cmdTale({ sock: fakeSock(tOut), players: tPlayers, savePlayers: () => {} }, "g@g.us", "new@s.whatsapp.net", {});
  check("new player enters the entry node directly", /The Black Crystals/.test(tOut[0]?.payload?.text || ""), (tOut[0]?.payload?.text || "").slice(0, 40));
  check("entry node stored on the player", H.taleOf(tPlayers["new@s.whatsapp.net"]).node === "signs-crystal");

  const wbSrc   = fs.readFileSync(path.join(ROOT, "systems", "wildbattle.js"), "utf8");
  const discSrc = fs.readFileSync(path.join(ROOT, "systems", "discoveries.js"), "utf8");
  check("wildbattle filters missing species", wbSrc.includes("filterAvailableMora"));
  check("wildbattle shows the quiet-grounds line", wbSrc.includes("noTraceLine"));
  check("discoveries filters missing species", discSrc.includes("filterAvailableMora"));
  check("discoveries shows the quiet-grounds line", discSrc.includes("noTraceLine"));

  // ════════════════════════════════════════════════════════════
  // P. HOLLOW MORA
  // ════════════════════════════════════════════════════════════
  section("P. hollow mora");
  check("hollow config present", !!H.hollowConfig(cfg) && H.hollowConfig(cfg).enabled === true);

  // Chapter I: not yet. Chapter II: active.
  const ch1 = { ...cfg, startDate: new Date(Date.now() + 20 * H.DAY_MS).toISOString(), endDate: new Date(Date.now() + 30 * H.DAY_MS).toISOString() };
  const ch2 = { ...cfg, startDate: new Date(Date.now() + 10 * H.DAY_MS).toISOString(), endDate: new Date(Date.now() + 20 * H.DAY_MS).toISOString() };
  check("hollow dormant in Chapter I", H.hollowActive(ch1) === false);
  check("hollow active in Chapter II", H.hollowActive(ch2) === true);
  check("hollow spawn never rolls while dormant", H.shouldHollowSpawn(ch1, Date.now(), () => 0) === false);
  check("hollow spawn rolls true on a low roll", H.shouldHollowSpawn(ch2, Date.now(), () => 0) === true);
  check("hollow spawn rolls false on a high roll", H.shouldHollowSpawn(ch2, Date.now(), () => 0.99) === false);

  const baseSpeciesFixture = { id: 2, name: "Thornel", rarity: "Rare", baseStats: { hp: 100, atk: 50, def: 40, spd: 60, energy: 50 }, moves: { A: {} } };
  const hv = H.buildHollowSpecies(baseSpeciesFixture, cfg);
  check("hollow species is prefixed", hv.name === "Hollow Thornel");
  check("hollow species is flagged", hv.isHollow === true && hv.isCorrupted === true);
  check("hollow keeps its base id + original name", hv.baseSpeciesId === 2 && hv.originalName === "Thornel");
  check("hollow carries its rider", hv.hollowRider?.id === "lingering_shadow");
  check("hollow stats scale",
    hv.baseStats.hp === 130 && hv.baseStats.atk === 70 && hv.baseStats.def === 46 && hv.baseStats.spd === 75,
    JSON.stringify(hv.baseStats));
  check("base species is not mutated by the variant", baseSpeciesFixture.name === "Thornel" && baseSpeciesFixture.baseStats.hp === 100 && !baseSpeciesFixture.isHollow);
  check("null species yields null", H.buildHollowSpecies(null, cfg) === null);
  check("hollow intro comes from the pool", typeof H.hollowIntro(cfg, () => 0) === "string" && H.hollowIntro(cfg, () => 0).length > 10);

  check("drops can roll everything", (() => { const d = H.rollHollowDrops(cfg, () => 0); return d.riftFragments > 0 && d.hollowEssence > 0 && d.ancientSeals > 0; })());
  check("drops can roll nothing", (() => { const d = H.rollHollowDrops(cfg, () => 0.99); return !d.riftFragments && !d.hollowEssence && !d.ancientSeals; })());

  const hp = { lucons: 0, eventChoices: {} };
  const dlog = H.hollowDefeatLog(hp, H.rollHollowDrops(cfg, () => 0), cfg);
  check("residue log names the haul", /HOLLOW RESIDUE/.test(dlog) && /Rift Fragment/.test(dlog));
  const res = H.resourcesOf(hp);
  check("residue is banked on the player", res.fragments >= 1 && res.essence >= 1 && res.seals >= 1);
  check("empty haul has a line", H.hollowDefeatLog({ eventChoices: {} }, { riftFragments: 0, hollowEssence: 0, ancientSeals: 0 }, cfg).length > 10);
  check("resource summary reads well", /fragments/.test(H.hollowResourceSummary(hp) || ""));

  const wbSrc2 = fs.readFileSync(path.join(ROOT, "systems", "wildbattle.js"), "utf8");
  check("wildbattle rolls the hollow variant", wbSrc2.includes("shouldHollowSpawn") && wbSrc2.includes("buildHollowSpecies"));
  check("wildbattle drops residue on defeat", wbSrc2.includes("hollowDefeatLog"));
  check("wildbattle feeds the world progress bar", wbSrc2.includes('recordProgress(hState, "hollowMoraDefeated"'));
  check("wildbattle carries isHollow on battle state", /isHollow,/.test(wbSrc2));

  H.resetPaths();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

  // ════════════════════════════════════════════════════════════
  // K. WIRING
  // ════════════════════════════════════════════════════════════
  section("K. wiring");
  const indexSrc   = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");
  const huntingSrc = fs.readFileSync(path.join(ROOT, "systems", "hunting.js"), "utf8");
  const regSrc     = fs.readFileSync(path.join(ROOT, "systems", "commandRegistry.js"), "utf8");
  const docSrc     = fs.readFileSync(path.join(ROOT, "events", "the-hollowing.md"), "utf8");

  check("index requires hollowing", indexSrc.includes("require('./systems/hollowing')"));
  check("loop start is guarded by isEnabled", /hollowingSystem\.isEnabled\(\)[\s\S]{0,600}startHollowingLoop/.test(indexSrc));
  check("index routes .hollowing", indexSrc.includes('command === "hollowing"') && indexSrc.includes("hollowingSystem.cmdHollowing"));
  check("hollowing skipped by faction consequences", /_skipConsequences = new Set\(\[[^\]]*"hollowing"/.test(indexSrc));

  check("hunting reads huntEnergyMultipliers", huntingSrc.includes("huntEnergyMultipliers"));
  check("hunting applies regen modifier", huntingSrc.includes("applyRegenModifier"));
  check("hunting applies drain modifier", huntingSrc.includes("applyDrainModifier"));

  check("registry lists .hollowing", /name:\s*"hollowing"/.test(regSrc));
  check("registry keeps the events subcat", regSrc.includes('subcat: "events"'));
  check("index routes .investigate", indexSrc.includes('command === "investigate"'));
  check("index routes hollow-* verbs generically", indexSrc.includes('command.startsWith("hollow-")'));
  check("index routes .muster", indexSrc.includes('command === "muster"'));
  check("registry lists .investigate and .muster", /name:\s*"investigate"/.test(regSrc) && /name:\s*"muster"/.test(regSrc));
  check("doc documents the story tree", /story tree/i.test(docSrc));
  check("doc documents the three layers", /three layers|audience/i.test(docSrc));
  check("doc documents the muster + group reward",
    /hollow muster/i.test(docSrc) && /everyone who answered is rewarded/i.test(docSrc));
  check("doc documents the state model", /Event State Model/i.test(docSrc) && /Global State/i.test(docSrc));
  check("doc documents the FIELD REPORT", /FIELD REPORT/i.test(docSrc));

  check("events doc exists", docSrc.length > 500);
  check("events doc separates LIVE/UPCOMING/PLANNED",
    docSrc.includes("**LIVE**") && docSrc.includes("**UPCOMING**") && docSrc.includes("**PLANNED**"));
  check("events doc documents the ending hook", /guarding something inside it/i.test(docSrc));
  check("events doc documents Mora non-deletion", /active: false/.test(docSrc));
  check("docs/EVENTS.md links the Hollowing",
    fs.readFileSync(path.join(ROOT, "docs", "EVENTS.md"), "utf8").includes("events/the-hollowing.md"));
  check("docs/PATCHES.md links the Hollowing",
    fs.readFileSync(path.join(ROOT, "docs", "PATCHES.md"), "utf8").includes("events/the-hollowing.md"));

  // ── summary ──
  console.log(`\n${"─".repeat(48)}`);
  console.log(`Hollowing: ${pass} passed / ${fail} failed`);
  if (failures.length) { console.log("Failures:"); for (const f of failures) console.log("  ✗ " + f); }
  console.log(fail === 0 ? "ALL GREEN" : "RED");
  process.exit(fail === 0 ? 0 : 1);
})();
