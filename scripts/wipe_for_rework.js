// scripts/wipe_for_rework.js
// One-shot wipe for the v0.6.0 launch. Resets every player to identity-only
// (username, profile icon, gender). All progression — lucons, levels, XP,
// moraOwned, shards, currentMerge, quests, styles, stats, faction state,
// inventory, equipment — is wiped clean. Players will re-pick faction,
// re-claim starter Mora, re-grind from scratch.
//
// Wipes BOTH:
//   • data/Players.json (local fallback / source of truth at boot)
//   • MongoDB `players` collection (production source of truth)
//
// Backs up Players.json to Players.json.pre-wipe-<timestamp>.
// Mongo docs are NOT deleted — their `data` field is replaced with the
// stripped record, so document IDs and timestamps are preserved.
//
// USAGE:
//   node scripts/wipe_for_rework.js --dry-run                # show, no writes
//   node scripts/wipe_for_rework.js --confirm                # wipe local + Mongo
//   node scripts/wipe_for_rework.js --confirm --local-only   # skip Mongo
//
// The script REFUSES to run without one of those flags.
// Mongo wipe requires MONGODB_URI in the environment.
"use strict";

require("dotenv").config();
const fs   = require("fs");
const path = require("path");

const PLAYERS_PATH  = path.join(__dirname, "..", "data", "Players.json");
const SETTINGS_PATH = path.join(__dirname, "..", "data", "settings.json");

const args      = new Set(process.argv.slice(2));
const DRY_RUN   = args.has("--dry-run");
const CONFIRM   = args.has("--confirm");
const LOCAL_ONLY = args.has("--local-only");

if (!DRY_RUN && !CONFIRM) {
  console.error("❌ Refusing to run. Pass --dry-run or --confirm.");
  console.error("   This script is destructive — it resets every player.");
  process.exit(1);
}
if (DRY_RUN && CONFIRM) {
  console.error("❌ Pass either --dry-run or --confirm, not both.");
  process.exit(1);
}

// ── Load ────────────────────────────────────────────────────────
const playersRaw = fs.readFileSync(PLAYERS_PATH, "utf-8");
const players    = JSON.parse(playersRaw);
const playerIds  = Object.keys(players);

console.log(`📦 Loaded ${playerIds.length} players from ${PLAYERS_PATH}`);

// ── What gets kept ──────────────────────────────────────────────
const KEEP_FIELDS = ["id", "username", "profileIcon", "gender"];

// ── Build the wiped player record ──────────────────────────────
function wipePlayer(p) {
  const next = {};
  for (const k of KEEP_FIELDS) {
    if (k in p) next[k] = p[k];
  }
  // The bot's schema-migration pass on next start fills in everything
  // else with defaults, so we deliberately leave the rest empty here.
  // Mark the wipe so the gift command can identify "returning" players.
  next.wipedAt = new Date("2026-05-27T00:00:00Z").toISOString();
  next.apologyClaimed = false;
  return next;
}

// ── Apply ──────────────────────────────────────────────────────
const wiped = {};
let preservedCount = 0;
for (const id of playerIds) {
  const before = players[id];
  if (!before || typeof before !== "object") continue;
  wiped[id] = wipePlayer(before);
  preservedCount++;
}

console.log(`🧼 Built wiped record for ${preservedCount} players.`);
console.log(`   Fields preserved per player: ${KEEP_FIELDS.join(", ")}`);
console.log(`   Plus: wipedAt, apologyClaimed=false`);

// ── Sample diff for the first 3 ────────────────────────────────
console.log(`\n📋 Sample (first 3 players):`);
playerIds.slice(0, 3).forEach((id) => {
  const before = players[id];
  const after  = wiped[id];
  console.log(`  ${id}`);
  console.log(`    before: ${Object.keys(before).length} fields`);
  console.log(`    after : ${Object.keys(after).length} fields  →  ${Object.keys(after).join(", ")}`);
});

// ── Mongo dry-run preview ─────────────────────────────────────
async function checkMongo() {
  if (LOCAL_ONLY) {
    console.log(`\n☁️  Mongo: --local-only set, skipping.`);
    return null;
  }
  if (!process.env.MONGODB_URI) {
    console.log(`\n☁️  Mongo: MONGODB_URI not set, skipping Mongo wipe.`);
    return null;
  }
  console.log(`\n☁️  Mongo: MONGODB_URI is set. Connecting to preview...`);
  const mongoose = require("mongoose");
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
    });
    const Player = mongoose.model(
      "Player",
      new mongoose.Schema(
        { jid: { type: String, required: true, unique: true, index: true },
          data: { type: mongoose.Schema.Types.Mixed, default: {} } },
        { timestamps: true }
      )
    );
    const count = await Player.countDocuments();
    console.log(`☁️  Mongo: ${count} player documents in collection.`);
    return { mongoose, Player, count };
  } catch (err) {
    console.error(`☁️  Mongo: connection failed — ${err.message}`);
    return null;
  }
}

(async () => {
  const mongo = await checkMongo();

  if (DRY_RUN) {
    if (mongo) await mongo.mongoose.connection.close();
    console.log(`\n✓ DRY RUN complete. Nothing was written.`);
    process.exit(0);
  }

  // ── Backup + write local ────────────────────────────────────
  const stamp      = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${PLAYERS_PATH}.pre-wipe-${stamp}`;
  fs.writeFileSync(backupPath, playersRaw);
  console.log(`\n💾 Local backup saved: ${backupPath}`);

  fs.writeFileSync(PLAYERS_PATH, JSON.stringify(wiped, null, 2));
  console.log(`✅ Players.json wiped and saved.`);

  // ── Stamp the launch timestamp into settings.json ──────────
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")); } catch {}
  settings.launchedAt         = new Date("2026-05-27T00:00:00Z").toISOString();
  settings.apologyAvailableAt = new Date("2026-07-14T00:00:00Z").toISOString(); // launch + 48d
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log(`✅ settings.json stamped: launchedAt + apologyAvailableAt`);

  // ── Wipe Mongo ──────────────────────────────────────────────
  if (mongo) {
    console.log(`\n☁️  Wiping ${mongo.count} Mongo player docs...`);
    let updated = 0;
    let inserted = 0;
    // Build the union of local + Mongo JIDs so we don't miss accounts
    const allMongoJids = (await mongo.Player.find({}).select({ jid: 1, _id: 0 }).lean())
      .map((d) => d.jid);
    const allJids = new Set([...Object.keys(wiped), ...allMongoJids]);

    for (const jid of allJids) {
      let stripped = wiped[jid];
      if (!stripped) {
        // Mongo-only player: build a bare-bones wiped record from their JID
        stripped = {
          id: jid,
          wipedAt: new Date("2026-05-27T00:00:00Z").toISOString(),
          apologyClaimed: false,
        };
      }
      const res = await mongo.Player.updateOne(
        { jid },
        { jid, data: stripped },
        { upsert: true }
      );
      if (res.upsertedCount) inserted++;
      else if (res.modifiedCount) updated++;
    }
    console.log(`☁️  Mongo wipe complete — updated ${updated}, inserted ${inserted}.`);
    await mongo.mongoose.connection.close();
  }

  console.log(`\n🌅 Wipe complete. Next bot start will re-initialize schemas for all players.`);
})();
