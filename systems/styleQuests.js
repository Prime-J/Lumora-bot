// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA STYLE QUEST CODES  v1.1.0                              ║
// ║  Per-player one-time secret codes for every scroll-gainable    ║
// ║  style. Codes are generated at successful registration,        ║
// ║  revealed when the scroll is opened in DM, and typed RAW in    ║
// ║  any group chat to begin that style's quest line.              ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";

let _styles = null;
function loadStyles() {
  if (_styles) return _styles;
  const f = path.join(__dirname, "..", "data", "styles.json");
  try { _styles = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _styles = {}; }
  return _styles;
}

// ── Player code state ──────────────────────────────────────────
// p.styleCodes = { [styleId]: { code, used } }
function ensureCodeFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.styleCodes || typeof player.styleCodes !== "object") player.styleCodes = {};
}

// Generate one-time codes for every scroll-gainable style. Idempotent:
// existing codes are preserved. Called once at successful registration.
function generateStyleCodes(player) {
  ensureCodeFields(player);
  const styles = loadStyles();
  for (const styleId of Object.keys(styles)) {
    if (player.styleCodes[styleId]?.code) continue;
    player.styleCodes[styleId] = {
      code: `lum-${crypto.randomBytes(3).toString("hex")}`, // e.g. lum-4f2a9c
      used: false,
    };
  }
}

// ── The intercept: is this raw text one of this player's codes? ──
// Returns { styleId, style } and consumes the code, or null.
function takeCode(ctx, senderId, text) {
  const { players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return null;
  ensureCodeFields(player);

  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length < 6 || t.length > 24 || !t.startsWith("lum-")) return null;

  for (const [styleId, entry] of Object.entries(player.styleCodes)) {
    if (entry?.code === t) {
      if (entry.used) return { alreadyUsed: true, styleId };
      entry.used = true;
      savePlayers(players);
      return { styleId, style: loadStyles()[styleId] };
    }
  }
  return null;
}

// Start (or resume) the style's quest after the code is accepted.
async function startStyleQuest(ctx, chatId, senderId, msg, styleId) {
  const { sock, players, savePlayers } = ctx;
  const questSystem = require("./quests");
  const player = players[senderId];
  questSystem.ensureQuestFields(player);

  const st = loadStyles()[styleId];
  const questId = st?.unlockQuest;
  const questDef = questSystem.loadQuests()[questId];

  if (!st || !questDef) {
    return sock.sendMessage(chatId, { text: "❌ This code's quest is missing from the world." }, { quoted: msg });
  }
  if (player.quests.completed.includes(questId)) {
    return sock.sendMessage(chatId, {
      text: `✅ You've already mastered *${st.name}*. The code dissolves.`,
    }, { quoted: msg });
  }
  if (player.quests.active[questId]) {
    // M2: a paused/interrupted drama resumes here (quest stays active).
    if (hasDrama(player, questId)) {
      return resumeDrama(ctx, chatId, senderId, msg, questId);
    }
    return sock.sendMessage(chatId, {
      text: `📜 *${questDef.name}* is already underway. Continue with the steps I DM'd you.`,
    }, { quoted: msg });
  }

  player.quests.active[questId] = { progress: 0, startedAt: Date.now(), stepProgress: {} };
  savePlayers(players);

  // M2: the wind_step line gets the full drama (teleport → beats → challenger).
  try {
    if (await beginDrama(ctx, chatId, senderId, msg, questId)) return;
  } catch (e) {
    console.log("[styleQuests] drama error, falling back to plain start:", e?.message || e);
  }

  // Public confirmation is short (it's a secret code — no leaking details),
  // full briefing goes to the DM.
  await sock.sendMessage(chatId, {
    text:
      `🌀 The code burns away as you speak it...\n` +
      `📜 *${questDef.name}* has begun for {mention}.\n` +
      `_Check your DM for the briefing._`,
    mentions: [senderId],
  }, { quoted: msg });

  const dmText =
    `🌀 *${st.name.toUpperCase()} — THE PATH OPENS*\n${DIVIDER}\n` +
    `_${questDef.lore}_\n${DIVIDER}\n` +
    `👤 Teacher: *${questDef.giver}*\n\n` +
    `${questSystem.renderQuestDetail(questDef)}\n${DIVIDER}\n` +
    `_Your code is spent — this path is yours alone now._`;
  try {
    await sock.sendMessage(senderId, { text: dmText });
  } catch {
    await sock.sendMessage(chatId, {
      text: `📩 I couldn't DM you the briefing — message me privately first, then say *${chatId === senderId ? "quest" : ".quest"}* to see your steps.`,
    }, { quoted: msg });
  }
}

// Grant the starter scroll at registration (so the discovery moment is immediate).
function grantStarterScroll(player) {
  if (!player || typeof player !== "object") return;
  if (!player.scrolls || typeof player.scrolls !== "object") player.scrolls = {};
  player.scrolls.windworn_scroll = Number(player.scrolls.windworn_scroll || 0) + 1;
}

// Level barrier check — used by quest completion to gate the teach moment.
function meetsLevelReq(player, styleId) {
  const st = loadStyles()[styleId];
  const req = Number(st?.levelReq || 0);
  return !req || Number(player?.level || 1) >= req;
}

// ══════════════════════════════════════════════════════════════
// M3 — TEACHER'S PRICE (materials + Lucons), data-driven per quest
// Requirements live on the quest def (teachReq); ITEMS live in the
// normal inventory (one owner). What the teacher has TAKEN so far is
// tracked on the player (p.styleQuest[qId].turnedIn) so progress
// survives restarts without duplicating inventory state.
// ══════════════════════════════════════════════════════════════

// Still owed for one material line: qty required minus already turned in.
const remaining = (m, turned) => Math.max(0, Number(m.qty || 0) - Number(turned?.[m.id] || 0));

function getTeachReq(questId) {
  return require("./quests").loadQuests()[questId]?.teachReq || null;
}

// What's still owed: remaining materials + whether the fee is unpaid.
function teachShortfall(player, questId) {
  const req = getTeachReq(questId);
  if (!req) return { missing: [], lucons: 0, done: true };
  ensureSqFields(player);
  const turned = player.styleQuest[questId]?.turnedIn || {};
  const inv = player.inventory || {};
  const missing = [];
  for (const m of req.materials || []) {
    const still = remaining(m, turned) - Math.min(remaining(m, turned), Number(inv[m.id] || 0));
    if (still > 0) missing.push({ id: m.id, name: itemName(m.id), qty: still, hint: m.hint || "" });
  }
  const lucons = Math.max(0, Number(req.lucons || 0) - Number(turned["__lucons"] || 0));
  return { missing, lucons, done: missing.length === 0 && lucons === 0 };
}

function itemInfo(id) {
  try {
    return require("./items").getAllItemsArray().find((x) => x.id === id) || null;
  } catch { return null; }
}
const itemName = (id) => itemInfo(id)?.name || id;

// Build the teacher's request card: missing materials, fee, and where to get them.
function renderTeachReq(player, questId) {
  const req = getTeachReq(questId);
  if (!req) return "";
  const sf = teachShortfall(player, questId);
  const lines = [];
  if (sf.missing.length) {
    lines.push(`📦 *Materials the teacher requires:*`);
    for (const m of sf.missing) {
      lines.push(`  • ${m.qty}× *${m.name}* (${m.id})${m.hint ? `\n     💡 _${m.hint}_` : ""}`);
    }
    lines.push(`_Drops are not certain — hunt and they will come._`);
  }
  if (sf.lucons > 0) lines.push(`💰 *Teaching fee:* *${sf.lucons} Lucons*`);
  return lines.length ? lines.join("\n") : "";
}

// Turn in materials (moved from inventory to the teacher's tally).
// Returns the message shown, or null if nothing could be turned in.
async function cmdSacrifice(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  const questId = findActiveDramaQuest(player) || "first_breath";
  const req = getTeachReq(questId);
  if (!req) return sock.sendMessage(chatId, { text: "❌ This trial takes no materials." }, { quoted: msg });
  if (!player.quests?.active?.[questId]) {
    return sock.sendMessage(chatId, { text: "❌ You are not on this trial." }, { quoted: msg });
  }
  ensureSqFields(player);
  if (!player.styleQuest[questId]) {
    player.styleQuest[questId] = { beat: 0, phase: "teacher" };
  }
  const sq = player.styleQuest[questId];
  sq.turnedIn = sq.turnedIn || {};

  let given = 0;
  for (const m of req.materials || []) {
    const need = Math.max(0, Number(m.qty || 0) - Number(sq.turnedIn[m.id] || 0));
    if (need <= 0) continue;
    const take = Math.min(need, Number(player.inventory?.[m.id] || 0));
    if (take > 0) {
      player.inventory[m.id] -= take;
      if (player.inventory[m.id] <= 0) delete player.inventory[m.id];
      sq.turnedIn[m.id] = Number(sq.turnedIn[m.id] || 0) + take;
      given += take;
    }
  }
  savePlayers(players);
  if (!given) {
    return sock.sendMessage(chatId, {
      text: `❌ You carry nothing the teacher asks for.\n\n${renderTeachReq(player, questId)}`,
    }, { quoted: msg });
  }
  const sf = teachShortfall(player, questId);
  const head = given === 1 ? `📦 The teacher takes the offering.` : `📦 The teacher takes *${given}* materials.`;
  const body = sf.done
    ? `\n✅ *All materials gathered.* Only the fee remains.`
    : `\n${renderTeachReq(player, questId)}`;
  return sock.sendMessage(chatId, { text: `${head}${body}` }, { quoted: msg });
}

// Teach gate — called from applyCompletion's callers via getTeachBlock.
// Returns a refusal message if materials/fee are unpaid, else null.
function getTeachBlock(player, questId) {
  const req = getTeachReq(questId);
  if (!req) return null;
  const sf = teachShortfall(player, questId);
  if (sf.done) return null;
  const lines = [`🔒 *The teacher raises a hand — the lesson is not paid for.*`];
  if (sf.missing.length) {
    lines.push(`📦 Still needed:`);
    for (const m of sf.missing) lines.push(`  • ${m.qty}× *${m.name}*${m.hint ? ` — 💡 _${m.hint}_` : ""}`);
  }
  if (sf.lucons > 0) lines.push(`💰 Teaching fee: *${sf.lucons} Lucons*${player.lucons < sf.lucons ? `  _(you carry ${Number(player.lucons || 0)})_` : ""}`);
  lines.push(`_The trial stays open. Bring everything, then speak the secret code again._`);
  return lines.join("\n");
}

// Non-certain quest-material drop, called from the hunt path. Reads the
// requirements of the quest the player is TRIALING (not completed), scales
// chance by the material's item rarity, and respects remaining need — full
// stock stops the roll so hunting stays honest. A `forced` roll (discovery
// reward) skips the probability gate. Returns {id,name,pct} or null.
function rollQuestMaterial(player, ground) {
  if (!player?.quests?.active) return null;
  const forced = !!ground?.forced;
  const questSystem = require("./quests");
  for (const qId of Object.keys(player.quests.active)) {
    const req = getTeachReq(qId);
    if (!req) continue;
    const sq = player.styleQuest?.[qId];
    for (const m of req.materials || []) {
      if (remaining(m, sq?.turnedIn) <= 0) continue; // teacher already has enough
      if (Number(player.inventory?.[m.id] || 0) >= remaining(m, sq?.turnedIn)) continue; // player carries enough
      // Rarity-scaled chance: Common 5%, Uncommon 3%, Rare 1.5%.
      const item = itemInfo(m.id);
      const key = String(item?.rarity || "Common").toLowerCase();
      const pct = key === "rare" ? 1.5 : key === "uncommon" ? 3 : 5;
      if (!forced && Math.random() * 100 >= pct) return null; // not certain
      return { id: m.id, name: item?.name || m.id, pct };
    }
  }
  return null;
}

// True when an active trial still needs materials the player doesn't carry —
// used by discoveries to boost the discovery chance (M3 payoff loop).
function hasOpenTrialNeed(player) {
  if (!player?.quests?.active) return false;
  const questSystem = require("./quests");
  for (const qId of Object.keys(player.quests.active)) {
    const req = getTeachReq(qId);
    if (!req) continue;
    const sq = player.styleQuest?.[qId];
    for (const m of req.materials || []) {
      if (remaining(m, sq?.turnedIn) > 0 && Number(player.inventory?.[m.id] || 0) < remaining(m, sq?.turnedIn)) return true;
    }
  }
  return false;
}

// Pay the fee + consume any remaining materials and mark the lesson paid.
// Returns { ok, message } — caller completes the quest on ok.
function payTeachReq(ctx, player, questId) {
  const req = getTeachReq(questId);
  if (!req) return { ok: true, message: "" };
  const sf = teachShortfall(player, questId);
  if (sf.done) return { ok: true, message: "" };
  // Materials still owed must be IN inventory now (auto-turn-in on pay).
  for (const m of req.materials || []) {
    if (remaining(m, player.styleQuest?.[questId]?.turnedIn) > 0 && Number(player.inventory?.[m.id] || 0) < remaining(m, player.styleQuest?.[questId]?.turnedIn)) {
      return { ok: false, message: getTeachBlock(player, questId) };
    }
  }
  if (Number(player.lucons || 0) < sf.lucons) {
    return { ok: false, message: getTeachBlock(player, questId) };
  }
  // Consume remaining materials + deduct fee, record in the tally.
  ensureSqFields(player);
  player.styleQuest[questId] = player.styleQuest[questId] || {};
  const sq = player.styleQuest[questId];
  sq.turnedIn = sq.turnedIn || {};
  for (const m of req.materials || []) {
    const need = remaining(m, sq.turnedIn);
    if (need > 0) {
      player.inventory[m.id] -= need;
      if (player.inventory[m.id] <= 0) delete player.inventory[m.id];
      sq.turnedIn[m.id] = Number(sq.turnedIn[m.id] || 0) + need;
    }
  }
  player.lucons = Number(player.lucons || 0) - sf.lucons;
  sq.turnedIn["__lucons"] = Number(req.lucons || 0);
  return { ok: true, message: `💰 Fee paid: *${sf.lucons} Lucons*. The teacher accepts.` };
}

// ══════════════════════════════════════════════════════════════
// M2 — QUEST-LINE DRAMA (wind_step / first_breath line only)
// Beats live in DATA below; STATE lives on the player
// (p.styleQuest = { beat, phase }) so there is one owner and it
// survives restarts. Buttons go through systems/buttons (text
// fallback built in); commands are .sq- prefixed and dispatched
// from index.js.
// ══════════════════════════════════════════════════════════════

const SQ_PREFIX = ".sq-";

// Drama scripts live in data/quest_drama.json (one entry per quest line).
let _drama = null;
const QUEST_DRAMA = () => {
  if (!_drama) {
    try { _drama = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "quest_drama.json"), "utf-8")); }
    catch { _drama = {}; }
  }
  return _drama;
};

function ensureSqFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.styleQuest || typeof player.styleQuest !== "object") player.styleQuest = {};
}

// Buttons send with guaranteed text fallback (buttons.js already falls back
// internally; this wrapper also survives a total send failure).
async function sqSend(btns, sock, chatId, text, labels, commands, opts = {}) {
  const map = {};
  labels.forEach((l, i) => { map[l] = commands[i]; });
  try {
    btns.mapButtons(map);
    return await btns.sendButtons(sock, chatId, text, labels, { footer: opts.footer || "Choose 👇", quoted: opts.msg });
  } catch (e) {
    console.log("[styleQuests] button send failed, text fallback:", e?.message || e);
    return sock.sendMessage(chatId, { text: text + "\n\n" + labels.join("  ·  ") }, { quoted: opts.msg });
  }
}

// Phase 1: teleport + PROCEED/RETREAT. Phase 2: story beats. Phase 3: challenger.
async function beginDrama(ctx, chatId, senderId, msg, questId) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const drama = QUEST_DRAMA()[questId];
  if (!player || !drama) return false; // no drama scripted → M1 behavior only

  ensureSqFields(player);
  player.styleQuest[questId] = { beat: 0, phase: "arrive" };
  savePlayers(players);

  await sock.sendMessage(chatId, {
    text:
      `🌀 *You are teleported to a foreign land...*\n${DIVIDER}\n` +
      `_The world folds. Wind takes your weight. When your feet find stone again, you are no longer where you were._`,
  }, { quoted: msg });

  const btns = require("./buttons");
  await sqSend(btns, sock, chatId,
    `❓ *Do you proceed?*\n_${drama.beats[0].place} lies ahead._`,
    ["🌀 PROCEED", "↩️ RETREAT"],
    [SQ_PREFIX + "proceed", SQ_PREFIX + "retreat"],
    { msg }
  );
  return true;
}

// Resume a paused drama (retreat) — re-offers the choice at the saved beat.
async function resumeDrama(ctx, chatId, senderId, msg, questId) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const drama = QUEST_DRAMA()[questId];
  if (!player || !drama) return false;
  const sq = player.styleQuest?.[questId];
  if (!sq || (sq.phase !== "arrive" && sq.phase !== "beat" && sq.phase !== "challenger")) return false;

  ensureSqFields(player);
  player.styleQuest[questId].paused = false;
  savePlayers(players);

  const btns = require("./buttons");
  const labels = sq.phase === "challenger"
    ? ["⚔️ CHALLENGE", "↩️ RETREAT"]
    : ["🌀 PROCEED", "↩️ RETREAT"];
  const commands = sq.phase === "challenger"
    ? [SQ_PREFIX + "fight", SQ_PREFIX + "retreat"]
    : [SQ_PREFIX + "proceed", SQ_PREFIX + "retreat"];
  await sqSend(btns, sock, chatId,
    `🌀 *The wind pulls you back.* Your trial resumes where you left it.`,
    labels, commands, { msg }
  );
  return true;
}

// .sq-proceed — advance the story beat (or open the challenger gate)
async function cmdProceed(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const questId = findActiveDramaQuest(player);
  if (!questId) {
    return sock.sendMessage(chatId, { text: "❌ No style trial in progress." }, { quoted: msg });
  }
  const drama = QUEST_DRAMA()[questId];
  const sq = player.styleQuest[questId];
  const btns = require("./buttons");

  if (sq.beat < drama.beats.length) {
    const beat = drama.beats[sq.beat];
    sq.beat += 1;
    sq.phase = "beat";
    savePlayers(players);

    const last = sq.beat >= drama.beats.length;
    await sock.sendMessage(chatId, {
      text:
        `📖 *${beat.place}*\n${DIVIDER}\n${beat.text}` +
        (last ? `\n\n⚔️ *${drama.challengerNpc}* awaits — level check: reach *level ${levelReqFor(drama.styleId) || 1}* to be taught.` : ""),
    }, { quoted: msg });

    if (last) {
      sq.phase = "challenger";
      savePlayers(players);
      await sqSend(btns, sock, chatId,
        `${drama.challengerIntro}\n${drama.challengerTaunt}`,
        ["⚔️ CHALLENGE", "↩️ RETREAT"],
        [SQ_PREFIX + "fight", SQ_PREFIX + "retreat"],
        { msg }
      );
    } else {
      await sqSend(btns, sock, chatId, `➡️ *Continue deeper?*`,
        ["CONTINUE ▶", "↩️ RETREAT"],
        [SQ_PREFIX + "proceed", SQ_PREFIX + "retreat"], { msg });
    }
    return;
  }

  // All beats read → (re)open the challenger gate
  sq.phase = "challenger";
  savePlayers(players);
  await sqSend(btns, sock, chatId,
    `${drama.challengerIntro}\n${drama.challengerTaunt}`,
    ["⚔️ CHALLENGE", "↩️ RETREAT"],
    [SQ_PREFIX + "fight", SQ_PREFIX + "retreat"],
    { msg }
  );
}

// .sq-retreat — pause; quest stays ACTIVE and resumable via the secret code.
async function cmdRetreat(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const questId = findActiveDramaQuest(player);
  if (!questId) {
    return sock.sendMessage(chatId, { text: "❌ No style trial in progress." }, { quoted: msg });
  }
  ensureSqFields(player);
  player.styleQuest[questId].paused = true;
  savePlayers(players);
  return sock.sendMessage(chatId, {
    text:
      `↩️ *You retreat.* The foreign land releases you — for now.\n` +
      `_Your trial is NOT lost. Speak your secret code again in any group chat to resume where you stood._`,
  }, { quoted: msg });
}

// .sq-fight — start the challenger battle via the real wild-battle engine.
// The NPC is a Mora scaled to the style's difficulty; it is tagged in the
// battle state so the victory hook knows this win advanced the trial.
async function cmdFight(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const questId = findActiveDramaQuest(player);
  if (!questId) {
    return sock.sendMessage(chatId, { text: "❌ No style trial in progress." }, { quoted: msg });
  }
  const drama = QUEST_DRAMA()[questId];
  const wb = require("./wildbattle");

  if (wb.getWildBattle(chatId, senderId)) {
    return sock.sendMessage(chatId, { text: "⚠️ Finish your current battle first." }, { quoted: msg });
  }

  const levelReq = Number(levelReqFor(drama.styleId) || 0);
  const playerLevel = Number(player.level || 1);
  if (levelReq && playerLevel < levelReq) {
    return sock.sendMessage(chatId, {
      text:
        `🔒 *${drama.challengerNpc} studies you and shakes his head.*\n` +
        `\"Come back at *level ${levelReq}*. The wind breaks those too green to bend.\"\n\n` +
        `_Your trial stays open — grind, return, challenge again._`,
    }, { quoted: msg });
  }

  const challengerLevel = Math.max(2, Math.round(levelReq + drama.challengerLevelScale * playerLevel));
  const ok = await wb.startWildBattle(ctx, chatId, senderId, msg, {
    baseId: drama.challengerSpeciesId,
    level: challengerLevel,
    allowCapture: false,
    styleQuestChallenge: { questId, npc: drama.challengerNpc },
  });
  if (ok !== false) {
    ensureSqFields(player);
    player.styleQuest[questId].phase = "battle";
    savePlayers(players);
  }
  return ok;
}

// Victory hook — called by the wild-battle defeat path when the defeated
// enemy carried styleQuestChallenge. Returns true if the trial advanced.
async function onChallengeWon(ctx, chatId, senderId, msg, challenge) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  const drama = QUEST_DRAMA()[challenge?.questId];
  if (!player || !drama) return false;
  ensureSqFields(player);
  if (!player.styleQuest[challenge.questId]) {
    player.styleQuest[challenge.questId] = { beat: 0, phase: "battle" };
  }
  player.styleQuest[challenge.questId].phase = "teacher";
  savePlayers(players);

  // Advance the meetNpc step through the REAL quest engine (no parallel state).
  const questSystem = require("./quests");
  questSystem.onNpcMeet(player, dramaNpcName(challenge.questId));
  savePlayers(players);

  const teachReq = getTeachReq(challenge.questId);
  await sock.sendMessage(chatId, {
    text:
      `🏅 *${drama.challengerNpc} — defeated.*\n${DIVIDER}\n` +
      `He kneels, breathing hard, and grins. \"Reva! This one's worth your breath!\"\n\n` +
      (teachReq
        ? `🎪 *The teacher will teach — for a price.*\n${renderTeachReq(player, challenge.questId)}\n\n` +
          `_Bring what she asks and .sacrifice it — or hold everything and speak your code to be taught._\n`
        : ``) +
      questSystem.nextStepGuide(questSystem.loadQuests()[challenge.questId], player.quests.active[challenge.questId]),
  }, { quoted: msg });
  return true;
}

function dramaNpcName(questId) {
  // The challenger's defeat IS the meeting with the quest's meetNpc step.
  const def = require("./quests").loadQuests()[questId];
  const step = (def?.requirement?.steps || []).find((s) => s.kind === "meetNpc");
  return step?.npc || null;
}

function levelReqFor(styleId) {
  return Number(loadStyles()[styleId]?.levelReq || 0);
}

// The quest this player has a drama running for (wind_step line only in M2).
function findActiveDramaQuest(player) {
  if (!player?.styleQuest) return null;
  let fallback = null;
  for (const qId of Object.keys(QUEST_DRAMA())) {
    const sq = player.styleQuest[qId];
    if (!sq || sq.paused || sq.phase === "done" || sq.phase === "teacher") continue;
    // The trial the player can ACT on right now wins: a challenger fight or
    // mid-beat story. Only fall back to "arrive" when nothing is further along
    // (so two fresh trials resolve deterministically instead of randomly).
    if (sq.phase === "battle" || sq.phase === "challenger" || sq.phase === "beat") return qId;
    if (sq.phase === "arrive") fallback = fallback || qId;
  }
  return fallback;
}

// Called from startStyleQuest's resume branch: if a drama exists for this
// quest, resume it instead of the plain "already underway" message.
function hasDrama(player, questId) {
  const sq = player?.styleQuest?.[questId];
  return !!sq && !!QUEST_DRAMA()[questId];
}

module.exports = {
  ensureCodeFields,
  generateStyleCodes,
  takeCode,
  startStyleQuest,
  grantStarterScroll,
  // M2 drama
  QUEST_DRAMA,
  beginDrama,
  resumeDrama,
  cmdProceed,
  cmdRetreat,
  cmdFight,
  onChallengeWon,
  hasDrama,
  findActiveDramaQuest,
  // M3 teacher's price
  getTeachReq,
  teachShortfall,
  getTeachBlock,
  renderTeachReq,
  cmdSacrifice,
  payTeachReq,
  rollQuestMaterial,
  hasOpenTrialNeed,
  meetsLevelReq,
};
