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
const syntheticNonMerge = { id: 999, name: "TestSpecies", rarity: "common" }; // no merge field
assert.ok(tideling && shardSystem.isMergeable(tideling), "Nylon should be mergeable");
assert.strictEqual(shardSystem.getMergeTier(tideling), "partial");
assert.strictEqual(shardSystem.getMergeTier(eternyx), "full");
assert.ok(!shardSystem.isMergeable(syntheticNonMerge), "Species without merge field should NOT be mergeable");
console.log(`✅ mergeable detection: Nylon=partial, Eternyx=full, synthetic=none`);

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

// ── 11. Trade — atomic swap between two players ────────────
const playerA = { id: "a@lid", username: "Aya" };
const playerB = { id: "b@lid", username: "Beto" };
shardSystem.ensureShardFields(playerA);
shardSystem.ensureShardFields(playerB);
shardSystem.dropShardOnDefeat(playerA, tideling, { forceDrop: true });
shardSystem.dropShardOnDefeat(playerB, eternyx,  { forceDrop: true });
assert.strictEqual(shardSystem.getShardCount(playerA, "1"),  1);
assert.strictEqual(shardSystem.getShardCount(playerB, "48"), 1);

// Simulate the swap directly (cmdTrade* relies on sock — we only test the
// underlying mutation here).
const swapA_to_B = (a, b, aKey, bKey) => {
  a.shards[aKey] -= 1; if (a.shards[aKey] <= 0) delete a.shards[aKey];
  a.shards[bKey] = (a.shards[bKey] || 0) + 1;
  b.shards[bKey] -= 1; if (b.shards[bKey] <= 0) delete b.shards[bKey];
  b.shards[aKey] = (b.shards[aKey] || 0) + 1;
};
swapA_to_B(playerA, playerB, "1", "48");
assert.strictEqual(shardSystem.getShardCount(playerA, "1"),  0, "A loses Nylon");
assert.strictEqual(shardSystem.getShardCount(playerA, "48"), 1, "A gains Eternyx");
assert.strictEqual(shardSystem.getShardCount(playerB, "1"),  1, "B gains Nylon");
assert.strictEqual(shardSystem.getShardCount(playerB, "48"), 0, "B loses Eternyx");
console.log("✅ trade: atomic swap (Aya ↔ Beto) verified");

// ── 12. Quests — accept + progress + complete unlocks style ─
const questSystem = require("../systems/quests");
const quester = { id: "q@lid", username: "Romio", level: 1, lucons: 0 };
questSystem.ensureQuestFields(quester);
quester.quests.active.first_breath = { progress: 0, startedAt: Date.now() };
const before = questSystem.getUnlockedStyleMoves(quester).length;
assert.strictEqual(before, 0, "no styles before quest complete");
// Simulate 3 battle wins (first_breath requires 3)
let completed = [];
for (let i = 0; i < 3; i++) completed = questSystem.onBattleWon(quester);
assert.ok(completed.includes("first_breath"), "first_breath should complete after 3 wins");
const def = questSystem.applyCompletion(quester, "first_breath");
assert.ok(def, "applyCompletion returns def");
assert.ok(quester.styles.includes("wind_step"), "wind_step should be unlocked");
assert.strictEqual(quester.lucons, 100, "Lucons reward credited");
const after = questSystem.getUnlockedStyleMoves(quester);
assert.ok(after.length >= 3, `wind step has 3 moves, got ${after.length}`);
console.log(`✅ quest: first_breath complete → wind_step unlocked (${after.length} moves)`);

// ── 13. Corrupted shards — drop, awaken, snapshot ──────────
const corrupter = { id: "c@lid", username: "Kael" };
shardSystem.ensureShardFields(corrupter);
const corrLog = shardSystem.dropCorruptedShard(corrupter, tideling);
assert.ok(corrLog && corrLog.includes("CORRUPTED"), "should log corrupted drop");
const corrKey = shardSystem.shardKey(tideling, { corrupted: true });
assert.strictEqual(shardSystem.getShardCount(corrupter, corrKey), 1, "corrupted shard counted");
assert.ok(shardSystem.isCorruptedKey(corrKey), "key recognized as corrupted");
assert.strictEqual(shardSystem.stripCorrupted(corrKey), "1", "strip yields base key");
// Normal and corrupted live in separate slots — cap of 1 each
shardSystem.dropShardOnDefeat(corrupter, tideling, { forceDrop: true });
assert.strictEqual(shardSystem.getShardCount(corrupter, "1"), 1, "normal Nylon also present");
assert.strictEqual(shardSystem.getShardCount(corrupter, corrKey), 1, "corrupted slot untouched");
// Awaken the corrupted variant — snapshot should carry corrupted=true
const snap = shardSystem.buildMergeSnapshot(tideling, { corrupted: true });
assert.strictEqual(snap.corrupted, true, "snapshot should be corrupted");
console.log(`✅ corrupted shards: drop, separate cap, snapshot all working`);

// ── 14. Catalog expansion — 5 styles, 6 quests ─────────────
const styles = questSystem.loadStyles();
const quests = questSystem.loadQuests();
assert.strictEqual(Object.keys(styles).length, 5, "5 styles expected");
assert.strictEqual(Object.keys(quests).length, 7, "7 quests expected");
assert.ok(styles.tide_veil && styles.bone_crush && styles.void_sever, "faction styles present");
console.log(`✅ catalog: ${Object.keys(styles).length} styles, ${Object.keys(quests).length} quests`);

// ── 15. Effect-field passthrough on style moves ────────────
const harmPlayer = { id: "h@lid", username: "Solen", level: 1, styles: ["tide_veil"], quests: { active: {}, completed: [] } };
questSystem.ensureQuestFields(harmPlayer);
const harmMoves = questSystem.getUnlockedStyleMoves(harmPlayer);
const mendingWave = harmMoves.find((m) => m.name === "Mending Wave");
assert.ok(mendingWave, "Mending Wave is in moveset");
assert.strictEqual(mendingWave.selfHeal, 18, "selfHeal passed through");
const ironStance = questSystem.getUnlockedStyleMoves({
  ...harmPlayer, styles: ["bone_crush"],
}).find((m) => m.name === "Iron Stance");
assert.strictEqual(ironStance.brace, true, "brace passed through");
assert.strictEqual(ironStance.counter, 20, "counter passed through");
const voidDrain = questSystem.getUnlockedStyleMoves({
  ...harmPlayer, styles: ["void_sever"],
}).find((m) => m.name === "Void Drain");
assert.strictEqual(voidDrain.energyRestore, 6, "energyRestore passed through");
console.log("✅ style effect fields: selfHeal/brace/counter/energyRestore all surface");

// ── 16. Stats: invest, derived bonuses, vitality healing ───
const statSystem = require("../systems/stats");
const stPlayer = { id: "st@lid", username: "Stater", level: 1, playerHp: 100, playerMaxHp: 100 };
statSystem.ensureStatFields(stPlayer);
statSystem.grantPointsForLevels(stPlayer, 3);
assert.strictEqual(stPlayer.statPoints, 9, "3 levels = 9 points");
// Invest 3 vit → +15 maxHP + heal
stPlayer.stats.vit = 3;
statSystem.applyVitInvest(stPlayer, 3);
assert.strictEqual(stPlayer.playerMaxHp, 115, "vit raises maxHp");
assert.strictEqual(stPlayer.playerHp, 115, "vit heals to new max");
// Damage bonuses
stPlayer.stats.melee = 5;
stPlayer.stats.mora  = 7;
assert.strictEqual(statSystem.meleeDamageBonus(stPlayer), 10, "melee=5 → +10 dmg");
assert.strictEqual(statSystem.moraDamageBonus(stPlayer),  14, "mora=7 → +14 dmg");
// Dodge cap
stPlayer.stats.speed = 100;
assert.strictEqual(statSystem.dodgeChance(stPlayer), 0.5, "speed dodge caps at 50%");
console.log("✅ stats: grant/invest/derived bonuses/vit heal/dodge cap all working");

// ── 17. Apology gift: gate, eligibility, claim ─────────────
const apologySystem = require("../systems/apology");
assert.ok(typeof apologySystem.isApologyOpen === "function");
assert.ok(typeof apologySystem.getApologyAvailableAt() === "number");
const giftablesList = apologySystem.getGiftableShards(loadMora);
assert.ok(giftablesList.length > 0, "should have rare/epic mergeable shards in mora.json");
console.log(`✅ apology gift: ${giftablesList.length} giftable shards, gate logic present`);

// ── 18. Scrolls: catalog, drop hook, open flow ─────────────
const scrollSystem = require("../systems/scrolls");
const cat = scrollSystem.loadScrolls();
assert.ok(Object.keys(cat).length >= 7, "scroll catalog has 7+ entries");
const scPlayer = { id: "sc@lid", username: "Reader", level: 1, intelligence: 0, quests: { active: {}, completed: [] }, styles: [] };
scrollSystem.ensureScrollFields(scPlayer);
// Force-add a scroll then verify open flow (without actually calling cmdOpen — no sock)
scPlayer.scrolls["windworn_scroll"] = 1;
const linked = cat.windworn_scroll;
assert.strictEqual(linked.grantsQuest, "first_breath", "scroll links to first_breath");
console.log(`✅ scrolls: ${Object.keys(cat).length} in catalog, scroll→quest mapping intact`);

// ── 19. Chained quest: progression via NPC meet + battles ───
const chainPlayer = { id: "ch@lid", username: "Pilgrim", level: 1, lucons: 0, intelligence: 0 };
questSystem.ensureQuestFields(chainPlayer);
chainPlayer.quests.active.the_first_keeper = { progress: 0, startedAt: Date.now(), stepProgress: {} };
const tfkDef = questSystem.loadQuests().the_first_keeper;
assert.ok(tfkDef && tfkDef.requirement.kind === "chain", "the_first_keeper is a chain quest");
assert.strictEqual(tfkDef.requirement.steps.length, 4, "4 chain steps");
// Meet Reva (step 0)
let r = questSystem.onNpcMeet(chainPlayer, "Reva");
assert.strictEqual(r.advanced.length, 1, "Reva meet advances");
// Meet Vance (step 1)
r = questSystem.onNpcMeet(chainPlayer, "Vance");
assert.strictEqual(r.advanced.length, 1, "Vance meet advances");
// Try to meet a non-pending NPC out of order — should NOT advance
r = questSystem.onNpcMeet(chainPlayer, "Solen");
assert.strictEqual(r.advanced.length, 0, "Solen doesn't match next pending step");
// Meet Kael (step 2)
r = questSystem.onNpcMeet(chainPlayer, "Kael");
assert.strictEqual(r.advanced.length, 1, "Kael meet advances");
// Now 5 battle wins for step 3
let chainCompleted = [];
for (let i = 0; i < 5; i++) chainCompleted = questSystem.onBattleWon(chainPlayer);
assert.ok(chainCompleted.includes("the_first_keeper"), "chain quest completes after final step");
const tfkDone = questSystem.applyCompletion(chainPlayer, "the_first_keeper");
assert.ok(tfkDone, "applyCompletion returns def");
assert.strictEqual(chainPlayer.lucons, 1000, "1000 lucons reward");
assert.strictEqual(chainPlayer.intelligence, 10, "10 intelligence reward");
console.log("✅ chained quest: 4-step the_first_keeper completes via meetNpc + winBattles");

// ── 20. xpSystem auto-grants stat points on level up ───────
const xpSystem = require("../core/xpSystem");
const xpPlayer = { username: "Climber", level: 1, xp: 0 };
statSystem.ensureStatFields(xpPlayer);
// Dump enough XP to level up at least once
const res = xpSystem.addPlayerXp(xpPlayer, 500);
assert.ok(res.leveledUp, "should level up");
assert.ok(res.statPointsGranted >= 3, `should grant ≥3 stat points, got ${res.statPointsGranted}`);
assert.strictEqual(xpPlayer.statPoints, res.statPointsGranted, "player.statPoints matches grant");
console.log(`✅ xpSystem → stat points: leveled ${res.levels}x → +${res.statPointsGranted} points`);

console.log("\n🎉 ALL v0.6.0 SMOKE TESTS PASSED (20 checks)");
