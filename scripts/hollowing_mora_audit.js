#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  The Hollowing — Mora audit
//
//  Decides which Mora are SAFE to mark "missing" from the active wilds.
//  Nothing is ever deleted: a hidden Mora keeps its record in
//  data/mora.json and can return in a later story event.
//
//  A Mora is safe ONLY if:
//    • no player owns it (checked against the live roster or the mirror)
//    • it is not a Common (Commons are the new-player starter pool)
//    • it is not named by quests / hunting grounds / encounters / NPCs / raids
//
//  Usage:
//    node scripts/hollowing_mora_audit.js              # report only
//    node scripts/hollowing_mora_audit.js --apply      # mark + write config
//
//  With MONGODB_URI set it audits the live roster; otherwise it falls back to
//  data/Players.json, then data/Players.json.pre-wipe.
// ══════════════════════════════════════════════════════════════
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT       = path.join(__dirname, "..");
const MORA_FILE  = path.join(ROOT, "data", "mora.json");
const CONFIG_FILE = path.join(ROOT, "data", "hollowing_config.json");
const OUT_FILE   = path.join(ROOT, "data", "hollowing_mora_audit.json");

const APPLY = process.argv.includes("--apply");
const TARGET_ACTIVE = 55; // aim for ~50-60 recognizable species

// files whose text is scanned for a species name (quests, spawns, bosses, NPCs)
const REFERENCE_SOURCES = [
  "data/quests.json",
  "data/hunting_grounds.json",
  "data/raid_state.json",
  "data/throne.json",
  "data/quest_drama.json",
  "systems/encounters.js",
  "systems/npcArena.js",
  "systems/progression.js",
  "systems/tutorial.js",
  "systems/quests.js",
  "systems/styleQuests.js",
  "systems/discoveries.js",
];

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function readText(file) {
  try { return fs.readFileSync(path.join(ROOT, file), "utf8"); } catch { return ""; }
}

// ── ownership ────────────────────────────────────────────────────
async function loadRoster() {
  if (process.env.MONGODB_URI) {
    try {
      const mongo = require(path.join(ROOT, "db", "mongo.js"));
      await mongo.initMongo();
      const players = await mongo.loadAllPlayers();
      const n = Object.keys(players || {}).length;
      if (n) return { players, source: `mongo (${n} players)` };
    } catch (e) {
      console.log("⚠️  mongo audit failed:", e?.message || e);
    }
  }
  for (const f of ["data/Players.json", "data/Players.json.pre-wipe"]) {
    const j = readJSON(path.join(ROOT, f), null);
    if (j && typeof j === "object" && Object.keys(j).length) {
      return { players: j, source: `${f} (${Object.keys(j).length} players) — MIRROR, may be stale` };
    }
  }
  return { players: {}, source: "none — ownership unknown" };
}

function ownedCounts(players) {
  const byId = new Map(), byName = new Map();
  for (const jid of Object.keys(players || {})) {
    const owned = players[jid]?.moraOwned;
    if (!Array.isArray(owned)) continue;
    for (const m of owned) {
      const id = Number(m?.moraId ?? m?.id);
      if (Number.isFinite(id)) byId.set(id, (byId.get(id) || 0) + 1);
      const nm = String(m?.name || "").trim().toLowerCase();
      if (nm) byName.set(nm, (byName.get(nm) || 0) + 1);
    }
  }
  return { byId, byName };
}

function buildReferenceIndex() {
  const corpora = REFERENCE_SOURCES.map(readText).join("\n").toLowerCase();
  return (name) => {
    const n = String(name || "").trim().toLowerCase();
    if (n.length < 3) return false;
    return corpora.includes(n);
  };
}

(async () => {
  const mora = readJSON(MORA_FILE, []);
  if (!Array.isArray(mora) || !mora.length) {
    console.error("❌ data/mora.json is empty or unreadable.");
    process.exit(1);
  }

  const { players, source } = await loadRoster();
  const { byId, byName } = ownedCounts(players);
  const isReferenced = buildReferenceIndex();

  const rows = mora.map((m) => {
    const rarity = String(m.rarity || "").trim().toLowerCase();
    const owned = (byId.get(Number(m.id)) || 0) + (byName.get(String(m.name).toLowerCase()) || 0);
    const isCommon = rarity === "common";
    const referenced = isReferenced(m.name);
    const alreadyHidden = m.active === false || m.missing === true;
    const safe = !alreadyHidden && owned === 0 && !isCommon && !referenced;
    const reasons = [];
    if (alreadyHidden) reasons.push("already-hidden");
    if (owned > 0) reasons.push(`owned×${owned}`);
    if (isCommon) reasons.push("starter-pool");
    if (referenced) reasons.push("referenced");
    return { id: m.id, name: m.name, type: m.type, rarity: m.rarity, owned, safe, reasons };
  });

  // Fill from the bottom up: Uncommon → Rare → Epic → Legendary. Legendaries are
  // the Mora players chase and name-drop, so they are hidden last, not first.
  const RARITY_ORDER = { uncommon: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
  const safe = rows.filter(r => r.safe).sort((a, b) => {
    const ra = RARITY_ORDER[String(a.rarity).toLowerCase()] ?? 5;
    const rb = RARITY_ORDER[String(b.rarity).toLowerCase()] ?? 5;
    return ra - rb || a.id - b.id;
  });
  const activeNow = rows.filter(r => !(r.reasons.includes("already-hidden"))).length;
  const needToHide = Math.max(0, activeNow - TARGET_ACTIVE);
  const recommended = safe.slice(0, needToHide);
  const recLegendary = recommended.filter(r => String(r.rarity).toLowerCase() === "legendary").length;

  // ── report ──
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  THE HOLLOWING — MORA AUDIT                              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Roster source : ${source}`);
  console.log(`Total species : ${rows.length}`);
  console.log(`Active now    : ${activeNow}`);
  console.log(`Target active : ~${TARGET_ACTIVE}`);
  console.log(`Need to hide  : ${needToHide}`);
  console.log(`Safe to hide  : ${safe.length}`);
  console.log("");
  console.log(`Held back by ownership   : ${rows.filter(r => r.reasons.includes("owned×") || /^owned/.test(r.reasons.join(" "))).length}`);
  console.log(`Held back as starter pool: ${rows.filter(r => r.reasons.includes("starter-pool")).length}`);
  console.log(`Held back as referenced  : ${rows.filter(r => r.reasons.includes("referenced")).length}`);
  console.log("");

  if (recommended.length) {
    console.log(`── RECOMMENDED TO GO MISSING (${recommended.length}) ──`);
    for (const r of recommended) console.log(`  #${String(r.id).padStart(3)}  ${r.name.padEnd(18)} ${String(r.rarity).padEnd(10)} ${r.type || ""}`);
    if (recLegendary) console.log(`\n⚠️  ${recLegendary} of these are Legendary — only because the safe pool is short of the target.`);
    if (/MIRROR/.test(source)) {
      console.log("⚠️  Ownership came from a stale mirror. Re-run with MONGODB_URI set (the live DB)");
      console.log("    before applying, or hide fewer species than the target.");
    }
  } else {
    console.log("── No safe candidates this pass. ──");
    if (needToHide > safe.length) {
      console.log(`⚠️  Only ${safe.length} safe of ${needToHide} needed. Options:`);
      console.log("    • raise the target active count,");
      console.log("    • run against the LIVE roster (set MONGODB_URI) so ownership is real,");
      console.log("    • or hand-pick species and pass them to --apply.");
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rosterSource: source,
    total: rows.length, activeNow, targetActive: TARGET_ACTIVE, needToHide,
    safeCount: safe.length,
    recommended: recommended.map(r => ({ id: r.id, name: r.name, rarity: r.rarity })),
    rows,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report → ${path.relative(ROOT, OUT_FILE)}`);

  // ── apply ──
  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply to mark these missing.");
    console.log("(Mora are never deleted — they keep their record and can return later.)");
    return;
  }
  if (!recommended.length) { console.log("\nNothing to apply."); return; }

  const ids = new Set(recommended.map(r => Number(r.id)));
  const updated = mora.map(m => ids.has(Number(m.id))
    ? { ...m, active: false, missing: true, missingSince: "the-hollowing" }
    : m);
  fs.writeFileSync(MORA_FILE, JSON.stringify(updated, null, 2));

  const cfg = readJSON(CONFIG_FILE, {}) || {};
  cfg.moraMissing = Array.from(new Set([
    ...(Array.isArray(cfg.moraMissing) ? cfg.moraMissing : []),
    ...recommended.map(r => ({ id: r.id, name: r.name })),
  ]));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));

  console.log(`\n✅ Applied: ${recommended.length} Mora marked missing (active:false, missing:true).`);
  console.log("✅ data/hollowing_config.json → moraMissing updated.");
  console.log("   mora.json keeps every record — reversible by clearing the flags.");
})();
