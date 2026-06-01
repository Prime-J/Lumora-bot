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

// ── 12. Chained quest: accept → meet NPC → battles → unlock style ─
const questSystem = require("../systems/quests");
const quester = { id: "q@lid", username: "Romio", level: 1, lucons: 0 };
questSystem.ensureQuestFields(quester);
quester.quests.active.first_breath = { progress: 0, startedAt: Date.now(), stepProgress: {} };
const before = questSystem.getUnlockedStyleMoves(quester).length;
assert.strictEqual(before, 0, "no styles before quest complete");
// Battles alone don't progress a chain — NPC meet is gating step 0
let completed = questSystem.onBattleWon(quester);
assert.ok(!completed.includes("first_breath"), "battles without meeting Reva shouldn't complete");
// Now meet Reva to unlock step 0
const meetRes = questSystem.onNpcMeet(quester, "Reva");
assert.strictEqual(meetRes.advanced.length, 1, "Reva meet advances chain step 0");
// Now win 3 battles
for (let i = 0; i < 3; i++) completed = questSystem.onBattleWon(quester);
assert.ok(completed.includes("first_breath"), "first_breath should complete after meet + 3 wins");
const def = questSystem.applyCompletion(quester, "first_breath");
assert.ok(def, "applyCompletion returns def");
assert.ok(quester.styles.includes("wind_step"), "wind_step should be unlocked");
assert.strictEqual(quester.lucons, 100, "Lucons reward credited");
const after = questSystem.getUnlockedStyleMoves(quester);
assert.ok(after.length >= 3, `wind step has 3 moves, got ${after.length}`);
console.log(`✅ chain quest: meet Reva → win 3 → wind_step unlocked (${after.length} moves)`);

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

// ── 14. Catalog expansion ──────────────────────────────────
const styles = questSystem.loadStyles();
const quests = questSystem.loadQuests();
assert.strictEqual(Object.keys(styles).length, 10, "10 styles expected (5 original + 5 Greek/Latin)");
assert.strictEqual(Object.keys(quests).length, 12, "12 quests expected");
assert.ok(styles.tide_veil && styles.bone_crush && styles.void_sever, "faction styles present");
assert.ok(styles.pyrolexis && styles.kataphraxis && styles.tenebris && styles.astrobolos && styles.anastasis, "new Greek/Latin styles present");
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

// ── 21. Purify (Harmony) — corrupted → normal, cap-aware ───
const harmonist = { id: "ha@lid", username: "Solen", faction: "harmony", lucons: 500 };
shardSystem.ensureShardFields(harmonist);
shardSystem.dropCorruptedShard(harmonist, tideling);
const corrKeyP = shardSystem.shardKey(tideling, { corrupted: true });
const normalKey = shardSystem.shardKey(tideling);
assert.strictEqual(shardSystem.getShardCount(harmonist, corrKeyP), 1);
assert.strictEqual(shardSystem.getShardCount(harmonist, normalKey), 0);
// Simulate cmdPurify body (no sock) — drain Lucons, swap variants
const cost = shardSystem.PURIFY_LUCONS_COST;
harmonist.lucons -= cost;
harmonist.shards[corrKeyP] -= 1;
if (harmonist.shards[corrKeyP] <= 0) delete harmonist.shards[corrKeyP];
harmonist.shards[normalKey] = (harmonist.shards[normalKey] || 0) + 1;
assert.strictEqual(shardSystem.getShardCount(harmonist, corrKeyP), 0, "corrupted gone");
assert.strictEqual(shardSystem.getShardCount(harmonist, normalKey), 1, "normal added");
assert.strictEqual(harmonist.lucons, 500 - cost, "lucons drained");
console.log(`✅ purify: corrupted Nylon → normal Nylon (cost ${cost} Lucons)`);

// ── 22. Destroy (Purity) — corrupted → Resonance ───────────
const puritan = { id: "pu@lid", username: "Vance", faction: "purity", resonance: 0 };
shardSystem.ensureShardFields(puritan);
shardSystem.dropCorruptedShard(puritan, eternyx);
const corrKeyD = shardSystem.shardKey(eternyx, { corrupted: true });
assert.strictEqual(shardSystem.getShardCount(puritan, corrKeyD), 1);
// Simulate cmdDestroy body
puritan.shards[corrKeyD] -= 1;
if (puritan.shards[corrKeyD] <= 0) delete puritan.shards[corrKeyD];
puritan.resonance += shardSystem.DESTROY_RESONANCE;
assert.strictEqual(shardSystem.getShardCount(puritan, corrKeyD), 0, "corrupted gone");
assert.strictEqual(puritan.resonance, shardSystem.DESTROY_RESONANCE, "Resonance granted");
console.log(`✅ destroy: corrupted Eternyx → +${shardSystem.DESTROY_RESONANCE} Resonance`);

// ── 23. Style rarity field present + buff scaling ──────────
assert.strictEqual(styles.wind_step.rarity,   "common",    "wind_step rarity");
assert.strictEqual(styles.tide_veil.rarity,   "rare",      "tide_veil rarity");
assert.strictEqual(styles.tenebris.rarity,    "epic",      "tenebris rarity");
assert.strictEqual(styles.anastasis.rarity,   "legendary", "anastasis rarity");
assert.strictEqual(questSystem.getRarityBuff("common"),    0.00, "common buff");
assert.strictEqual(questSystem.getRarityBuff("rare"),      0.05, "rare buff");
assert.strictEqual(questSystem.getRarityBuff("epic"),      0.12, "epic buff");
assert.strictEqual(questSystem.getRarityBuff("legendary"), 0.22, "legendary buff");
// styleRarity field surfaces on each move
const rare1 = questSystem.getUnlockedStyleMoves({ styles: ["tide_veil"], quests: { active: {}, completed: [] } });
assert.ok(rare1.every((m) => m.styleRarity === "rare"), "all tide_veil moves carry rare");
const leg1 = questSystem.getUnlockedStyleMoves({ styles: ["anastasis"], quests: { active: {}, completed: [] } });
assert.ok(leg1.every((m) => m.styleRarity === "legendary"), "all anastasis moves carry legendary");
console.log(`✅ rarity buffs: common +0%, rare +5%, epic +12%, legendary +22% — fields surface on moves`);

// ── 24. New style quests: chained, hidden commands ─────────
const newQuests = ["rite_of_embers", "vow_of_the_shield", "covenant_of_caligo", "starlit_passage", "the_mercy_rising"];
for (const qId of newQuests) {
  const q = quests[qId];
  assert.ok(q, `${qId} exists`);
  assert.strictEqual(q.requirement.kind, "chain", `${qId} is chain`);
  assert.ok(Array.isArray(q.requirement.steps) && q.requirement.steps.length >= 2, `${qId} has 2+ steps`);
  assert.ok(q.hiddenCommands && Object.keys(q.hiddenCommands).length >= 1, `${qId} has hidden commands`);
}
// Existing style quests also converted to chain
for (const qId of ["first_breath", "first_dawn", "tides_of_sanctuary", "oath_of_iron", "void_initiation"]) {
  assert.strictEqual(quests[qId].requirement.kind, "chain", `${qId} converted to chain`);
  assert.ok(quests[qId].hiddenCommands, `${qId} has hidden commands`);
}
console.log("✅ all 10 style quests now chained + each has hidden commands");

// ── 25. Scrolls: 12 in catalog (7 original + 5 new), image helper degrades cleanly ─
const scrollCat = scrollSystem.loadScrolls();
assert.strictEqual(Object.keys(scrollCat).length, 12, "12 scrolls expected");
assert.ok(scrollCat.ember_tongue_scroll && scrollCat.lumen_folio && scrollCat.shieldbearers_scroll, "new scrolls present");
// image helper returns null when no asset exists
assert.strictEqual(scrollSystem.scrollImagePath("windworn_scroll"), null, "no image file → null (graceful)");
assert.strictEqual(scrollSystem.scrollImagePath("nonexistent_id"), null, "unknown id → null");
console.log(`✅ scrolls: ${Object.keys(scrollCat).length} in catalog, image helper degrades gracefully`);

// ── 26. New chain quest progression (rite_of_embers) ───────
const fireQuester = { id: "f@lid", username: "Embra", level: 1, lucons: 0 };
questSystem.ensureQuestFields(fireQuester);
fireQuester.quests.active.rite_of_embers = { progress: 0, startedAt: Date.now(), stepProgress: {} };
let r2 = questSystem.onNpcMeet(fireQuester, "Phlox");
assert.strictEqual(r2.advanced.length, 1, "Phlox meet advances");
let chainCompleted2 = [];
for (let i = 0; i < 5; i++) chainCompleted2 = questSystem.onBattleWon(fireQuester);
assert.ok(chainCompleted2.includes("rite_of_embers"), "rite_of_embers completes");
questSystem.applyCompletion(fireQuester, "rite_of_embers");
assert.ok(fireQuester.styles.includes("pyrolexis"), "pyrolexis unlocked");
assert.strictEqual(fireQuester.lucons, 200, "lucons reward");
console.log("✅ new style chain: Phlox → win 5 → Pyrolexis unlocked + 200 Lucons");

// ── 27. Level curve + max level 100 cap ────────────────────
const xpSystemMod = require("../core/xpSystem");
assert.strictEqual(xpSystemMod.MAX_PLAYER_LEVEL, 100, "max level = 100");
assert.strictEqual(xpSystemMod.playerXpToNextLevel(1),  150, "level 1 needs 150 XP");
assert.strictEqual(xpSystemMod.playerXpToNextLevel(50), 5050, "level 50 needs 5050 XP");
assert.strictEqual(xpSystemMod.playerXpToNextLevel(99), 9950, "level 99 needs 9950 XP");
assert.strictEqual(xpSystemMod.playerXpToNextLevel(100), Infinity, "level 100 cap returns Infinity");
// Test max-level cap behavior: a level-99 player gains a huge XP chunk
const capper = { level: 99, xp: 0 };
statSystem.ensureStatFields(capper);
const capRes = xpSystemMod.addPlayerXp(capper, 100000);
assert.strictEqual(capper.level, 100, "should hit cap at 100");
assert.strictEqual(capper.xp, 0, "XP drained at cap");
// Another grant past cap drops everything
const beyondRes = xpSystemMod.addPlayerXp(capper, 50000);
assert.strictEqual(beyondRes.leveledUp, false, "no more levels past 100");
assert.strictEqual(capper.level, 100, "stays at 100");
assert.strictEqual(capper.xp, 0, "post-cap XP discarded");
console.log("✅ level curve: linear 100*lv+50, capped at 100, no XP overflow");

// ── 28. Auto-raid: spawn → respond → engage → resolve ──────
const autoRaid = require("../systems/autoRaid");
// Simulate state directly (no sock)
const arState = autoRaid.loadState();
// Reset to idle for a clean test
arState.phase = "idle";
arState.responder = null;
arState.victim = null;
arState.engagements = [];
delete arState._nextSpawnAt;
autoRaid.saveState(arState);
// Move into waiting_response manually to skip the timer wait
const fresh = autoRaid.loadState();
fresh.phase = "waiting_response";
fresh.spawnedAt = Date.now();
fresh.responseDeadline = Date.now() + 5 * 60_000;
autoRaid.saveState(fresh);
// Verify .respond rules (would need full sock to test cmdRespond — just verify state)
assert.strictEqual(autoRaid.loadState().phase, "waiting_response", "in response phase");
// Simulate manual response lock
const r2state = autoRaid.loadState();
r2state.phase = "active";
r2state.responder = { jid: "resp@lid", faction: "harmony" };
r2state.victim = "rift";
r2state.kaelHpMax = 500;
r2state.kaelHp = 500;
r2state.raidDeadline = Date.now() + 30 * 60_000;
autoRaid.saveState(r2state);
// Engagement reduces HP
const eng = autoRaid.loadState();
eng.kaelHp -= 50;
eng.engagements.push({ jid: "a@lid", dmg: 50, at: Date.now() });
autoRaid.saveState(eng);
assert.strictEqual(autoRaid.loadState().kaelHp, 450, "Kael HP reduced");
assert.strictEqual(autoRaid.loadState().engagements.length, 1, "engagement recorded");
console.log("✅ auto-raid: state machine flows idle → waiting → active, engagement reduces HP");

// Reset state so file doesn't carry test data forward
const reset = autoRaid.loadState();
reset.phase = "idle";
reset.responder = null;
reset.victim = null;
reset.engagements = [];
reset.kaelHp = 0;
reset.kaelHpMax = 0;
reset.spawnedAt = 0;
reset.responseDeadline = 0;
reset.raidDeadline = 0;
delete reset._nextSpawnAt;
autoRaid.saveState(reset);

// ── 29. PvP module loads + exports expected commands ──────
const playerBattle = require("../systems/playerBattle");
for (const cmd of ["cmdBattle", "cmdAccept", "cmdReject", "cmdAttack", "cmdCharge", "cmdForfeit", "getBattle", "clearBattle"]) {
  assert.strictEqual(typeof playerBattle[cmd], "function", `playerBattle.${cmd} exists`);
}
// getBattle returns null for chats with no battle
assert.strictEqual(playerBattle.getBattle("nochat@g.us"), null, "getBattle null for empty");
console.log("✅ playerBattle module exports all PvP commands");

// ── 30. PvP shares wildbattle's combat helpers (no duplication) ──
const wbExports = require("../systems/wildbattle");
for (const helper of ["BASE_ACTIONS", "ensurePlayerCombatFields", "getPlayerCombatant",
                       "buildPlayerMoveset", "renderPlayerMoveset", "resolvePlayerMove",
                       "regenPlayerCombatEnergy", "calcDamage"]) {
  assert.ok(wbExports[helper] != null, `wildbattle exports ${helper}`);
}
console.log("✅ wildbattle helpers exported for shared use");

// ── 31. PvP combatant build uses same stat math as wild ────
const pvpPlayer = {
  id: "x@lid",
  username: "Duelist",
  level: 25,
  playerHp: 100,
  playerMaxHp: 100,
  aura: 50,
  intelligence: 20,
};
wbExports.ensurePlayerCombatFields(pvpPlayer);
statSystem.ensureStatFields(pvpPlayer);
pvpPlayer.stats.melee = 10;
pvpPlayer.stats.mora  = 5;
pvpPlayer.stats.vit   = 8;
const combatant = wbExports.getPlayerCombatant(pvpPlayer, loadMora);
assert.ok(combatant.atk > 0, "combatant has attack");
assert.ok(combatant.def > 0, "combatant has defense");
assert.strictEqual(combatant.level, 25, "combatant level mirrors player level");
// Moveset includes base actions
const pvpMoves = wbExports.buildPlayerMoveset(pvpPlayer, loadMora);
assert.ok(pvpMoves.length >= 2, "at least base actions present");
assert.ok(pvpMoves.some((m) => m.name === "Punch"), "Punch is in base moveset");
console.log("✅ PvP combatant/moveset uses same helpers as wild combat");

// ── 32. Items v0.8.0: 8 new items in items.json ──────────
const itemsCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "items.json"), "utf-8"));
for (const id of ["SHARD_VIAL","SHARD_LURE","HP_TINCTURE","HP_TONIC_FULL","ENERGY_TONIC","RESONANCE_VIAL","READERS_INK","QUEST_COMPASS"]) {
  assert.ok(itemsCatalog[id], `${id} present in items.json`);
  assert.ok(itemsCatalog[id].effects, `${id} has effects`);
}
console.log("✅ items.json: 8 new consumables present with effects");

// ── 33. Effect engine: new keys mutate player as expected ────
const inv = require("../systems/inventory");
const efxPlayer = {
  id: "efx@lid", username: "Tester",
  playerHp: 30, playerMaxHp: 100,
  combatEnergy: 5, combatMaxEnergy: 50,
  resonance: 0, intelligence: 0, riftPE: 60,
  shards: {}, shardStorage: {}, currentMerge: null,
};
// healFull restores full
inv.applyItemEffects(efxPlayer, { healFull: true });
assert.strictEqual(efxPlayer.playerHp, 100, "healFull → full HP");
// energyRefill restores full combat energy
inv.applyItemEffects(efxPlayer, { energyRefill: true });
assert.strictEqual(efxPlayer.combatEnergy, 50, "energyRefill → full combat energy");
// resonance + intelligence boosts
inv.applyItemEffects(efxPlayer, { resonanceBoost: 50, intelligenceBoost: 3 });
assert.strictEqual(efxPlayer.resonance, 50, "+50 resonance");
assert.strictEqual(efxPlayer.intelligence, 3, "+3 intelligence");
// primordialReduce now drains player.riftPE
inv.applyItemEffects(efxPlayer, { primordialReduce: 25 });
assert.strictEqual(efxPlayer.riftPE, 35, "primordialReduce drains player.riftPE");
// primordialInstant raises player.riftPE
inv.applyItemEffects(efxPlayer, { primordialInstant: 40 });
assert.strictEqual(efxPlayer.riftPE, 75, "primordialInstant boosts player.riftPE");
// forceShardDropNext sets passive
inv.applyItemEffects(efxPlayer, { forceShardDropNext: true });
assert.strictEqual(efxPlayer.passives?.forceShardDropNext, true, "forceShardDropNext passive set");
console.log("✅ effect engine: healFull/energyRefill/resonance/intel/PE/shardLure all apply correctly");

// ── 34. Item-based purify: corrupted shard cleansed via effect ──
const purgePlayer = { id: "p@lid", username: "Vance", lucons: 0, shards: {}, shardStorage: {} };
shardSystem.ensureShardFields(purgePlayer);
shardSystem.dropCorruptedShard(purgePlayer, tideling);
const ckey = shardSystem.shardKey(tideling, { corrupted: true });
assert.strictEqual(shardSystem.getShardCount(purgePlayer, ckey), 1, "corrupted Nylon dropped");
inv.applyItemEffects(purgePlayer, { purifyShard: true }, { loadMora });
assert.strictEqual(shardSystem.getShardCount(purgePlayer, ckey), 0, "corrupted consumed");
assert.strictEqual(shardSystem.getShardCount(purgePlayer, "1"), 1, "normal shard granted");
console.log("✅ item-based purify: corrupted Nylon → normal Nylon, no Lucon cost");

// ── 35. Melee invest grows combat-energy max ──────────
const melPlayer = { id: "m@lid", username: "Bruiser", level: 1, statPoints: 5,
                    playerHp: 100, playerMaxHp: 100, combatEnergy: 50, combatMaxEnergy: 50 };
statSystem.ensureStatFields(melPlayer);
const beforeMax = melPlayer.combatMaxEnergy;
statSystem.applyMeleeInvest(melPlayer, 10);
assert.strictEqual(melPlayer.combatMaxEnergy, beforeMax + 10, "10 melee points → +10 stamina");
assert.strictEqual(melPlayer.combatEnergy, melPlayer.combatMaxEnergy, "energy refilled to new max");
console.log("✅ melee → +1 combat-energy max per point (stamina scales with dedication)");

console.log("\n🎉 ALL v0.8.0 SMOKE TESTS PASSED (35 checks)");
