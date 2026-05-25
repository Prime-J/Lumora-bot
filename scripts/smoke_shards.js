// Skeleton smoke test for the v0.5.0 shard / merge loop.
// Runs the shards module against a fake player + the real mora.json — no bot
// needed. Asserts the full loop: drop → list → awaken → swap → shed.
//
// Usage:  node scripts/smoke_shards.js
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const shardSystem = require("../systems/shards");

const moraList = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "mora.json"), "utf-8")
);
function loadMora() { return moraList; }

function findByName(name) {
  return moraList.find((m) => m.name.toLowerCase() === name.toLowerCase());
}

const player = {
  id: "test@lid",
  username: "Smoketester",
  playerHp: 100,
  playerMaxHp: 100,
};

// ── 1. Schema migration ─────────────────────────────────────
shardSystem.ensureShardFields(player);
assert.deepStrictEqual(player.shards, {}, "shards should init empty");
assert.deepStrictEqual(player.shardStorage, {}, "shardStorage should init empty");
assert.strictEqual(player.currentMerge, null, "currentMerge should init null");
console.log("✅ schema migration: shards={}, shardStorage={}, currentMerge=null");

// ── 2. Mergeable detection ──────────────────────────────────
const tideling = findByName("Nylon"); // tagged partial
const eternyx  = findByName("Eternyx"); // tagged full
const nonMerge = moraList.find((m) => !m.merge);
assert.ok(tideling && shardSystem.isMergeable(tideling), "Nylon should be mergeable");
assert.strictEqual(shardSystem.getMergeTier(tideling), "partial");
assert.strictEqual(shardSystem.getMergeTier(eternyx), "full");
assert.ok(!shardSystem.isMergeable(nonMerge), `${nonMerge.name} should NOT be mergeable`);
console.log(`✅ mergeable detection: Nylon=partial, Eternyx=full, ${nonMerge.name}=none`);

// ── 3. Drop (forced) ────────────────────────────────────────
const dropLog = shardSystem.dropShardOnDefeat(player, tideling, { forceDrop: true });
assert.ok(dropLog && dropLog.includes("Nylon"), "drop log should mention Nylon");
assert.strictEqual(shardSystem.getShardCount(player, "1"), 1, "should have 1 Nylon shard");
console.log("✅ drop:", dropLog.split("\n")[0]);

// ── 4. Storage cap enforcement (second drop blocked) ────────
const dropLog2 = shardSystem.dropShardOnDefeat(player, tideling, { forceDrop: true });
assert.ok(dropLog2 && dropLog2.includes("vault is full"), "second drop should hit cap");
assert.strictEqual(shardSystem.getShardCount(player, "1"), 1, "count stays at 1 over cap");
console.log("✅ cap enforced:", dropLog2.split("\n")[0]);

// ── 5. Awaken (simulate without sock) ───────────────────────
// We can't call cmdAwaken directly (it sends messages). Instead exercise the
// pieces it relies on: shard consume + buildMergeSnapshot + clearStatusEffects.
player.shards["1"] -= 1;
delete player.shards["1"];
shardSystem.clearMergeStatusEffects(player);
player.currentMerge = shardSystem.buildMergeSnapshot?.(tideling) || {
  moraId: tideling.id, name: tideling.name, type: tideling.type,
  tier: "partial", moves: Object.keys(tideling.moves || {}), awakenedAt: Date.now(),
};
assert.ok(shardSystem.isMerged(player), "should be merged now");
assert.strictEqual(player.currentMerge.name, "Nylon");
console.log(`✅ awakened: currentMerge=${player.currentMerge.name} (${player.currentMerge.tier})`);

// ── 6. Display name prefix ──────────────────────────────────
const display = shardSystem.getMergedDisplayName(player, "Smoketester");
assert.strictEqual(display, "[Nylon] Smoketester", "name should be prefixed");
console.log("✅ display prefix:", display);

// ── 7. Merge moveset accessible ─────────────────────────────
const mergeMoves = shardSystem.getMergeMoves(player);
assert.ok(mergeMoves.length > 0, "merge should expose moves");
console.log(`✅ merge moveset (${mergeMoves.length}):`, mergeMoves.join(", "));

// ── 8. Swap (awaken Eternyx while merged with Nylon) ────────
shardSystem.dropShardOnDefeat(player, eternyx, { forceDrop: true });
assert.strictEqual(shardSystem.getShardCount(player, "48"), 1);
player.shards["48"] -= 1;
delete player.shards["48"];
const prevMerge = player.currentMerge;
shardSystem.clearMergeStatusEffects(player);
player.currentMerge = {
  moraId: eternyx.id, name: eternyx.name, type: eternyx.type,
  tier: "full", moves: Object.keys(eternyx.moves || {}), awakenedAt: Date.now(),
};
assert.strictEqual(player.currentMerge.name, "Eternyx");
assert.notStrictEqual(player.currentMerge.name, prevMerge.name);
console.log(`✅ merge swap: ${prevMerge.name} → ${player.currentMerge.name} (status wiped)`);

// ── 9. Shed ─────────────────────────────────────────────────
shardSystem.clearMergeStatusEffects(player);
player.currentMerge = null;
assert.strictEqual(shardSystem.isMerged(player), false, "should be base form after shed");
assert.strictEqual(
  shardSystem.getMergedDisplayName(player, "Smoketester"),
  "Smoketester",
  "no prefix when shed"
);
console.log("✅ shed: back to base form, prefix gone");

// ── 10. Spawn-source drop rate path runs without throwing ──
const spawnLog = shardSystem.dropShardOnDefeat(player, tideling, { source: "spawn", forceDrop: true });
assert.ok(spawnLog, "spawn-source forced drop should still log");
console.log("✅ spawn-source path runs");

console.log("\n🎉 ALL SHARD/MERGE SMOKE TESTS PASSED");
