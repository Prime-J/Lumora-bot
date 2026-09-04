// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA QUEST + FIGHTING-STYLE SYSTEM  v0.5.0                 ║
// ║  Minimal quest engine: accept → progress (battle wins) →      ║
// ║  complete → unlock fighting style + Lucons.                   ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const STYLE_ASSETS_DIR = path.join(__dirname, "..", "assets", "styles");
const buttonsSystem = require("./buttons");

let _quests = null;
let _styles = null;

// Return the absolute path to a style's art if it exists on disk.
// Operator (Prime) drops PNGs at assets/styles/<styleId>.{png,jpg,jpeg,webp}.
// These same images double as the Lumora Roblox game icons (see docs/STYLE_ART_PROMPTS.md).
function styleImagePath(styleId) {
  if (!styleId) return null;
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(STYLE_ASSETS_DIR, `${styleId}.${ext}`);
    try { if (fs.statSync(p).isFile()) return p; } catch { /* not present */ }
  }
  return null;
}

function loadQuests() {
  if (_quests) return _quests;
  const f = path.join(__dirname, "..", "data", "quests.json");
  try { _quests = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _quests = {}; }
  return _quests;
}
function loadStyles() {
  if (_styles) return _styles;
  const f = path.join(__dirname, "..", "data", "styles.json");
  try { _styles = JSON.parse(fs.readFileSync(f, "utf-8")); } catch { _styles = {}; }
  return _styles;
}
function reloadCatalog() { _quests = null; _styles = null; }

// ── Style rarity damage multiplier ──
// Rarer styles hit slightly harder. Tunable here.
const STYLE_RARITY_BUFF = {
  common:    0.00,
  rare:      0.05,
  epic:      0.12,
  legendary: 0.22,
};
function getRarityBuff(rarity) {
  return Number(STYLE_RARITY_BUFF[String(rarity || "common").toLowerCase()] || 0);
}

// ── Per-player schema ──
// p.quests = {
//   active:    { questId: { progress: N, startedAt: ts } },
//   completed: [ questId, ... ]
// }
// p.styles = [ styleId, ... ]
function ensureQuestFields(player) {
  if (!player || typeof player !== "object") return;
  if (!player.quests || typeof player.quests !== "object") player.quests = {};
  if (!player.quests.active || typeof player.quests.active !== "object") player.quests.active = {};
  if (!Array.isArray(player.quests.completed)) player.quests.completed = [];
  if (!Array.isArray(player.styles)) player.styles = [];
}

// Returns the player's unlocked fighting-style move list, flattened.
// Used by the combat system to extend the player's moveset.
// FIX (2-style bug): only the EQUIPPED style's moves are returned —
// unlocking more styles no longer stacks every moveset into combat.
function getEquippedStyleId(player) {
  ensureQuestFields(player);
  const equipped = player.equippedStyle;
  if (equipped && player.styles.includes(equipped)) return equipped;
  return player.styles[0] || null;
}

function getUnlockedStyleMoves(player) {
  ensureQuestFields(player);
  const styles = loadStyles();
  const out = [];
  const equippedId = getEquippedStyleId(player);
  if (!equippedId) return out;
  const st = styles[equippedId];
  if (!st) return out;
  for (const mv of (st.moves || [])) {
    // Spread mv first so opt-in effect fields (selfHeal/brace/counter/
    // energyRestore) pass through to the combat handler.
    out.push({
      ...mv,
      name: mv.name,
      power: Number(mv.power || 0),
      accuracy: Number(mv.accuracy || 100),
      energyCost: Number(mv.energyCost || Math.max(3, Math.floor(Number(mv.power || 0) / 8) + 3)),
      desc: mv.desc || "",
      source: "style",
      styleId: equippedId,
      styleName: st.name,
      styleType: st.type,
      styleRarity: String(st.rarity || "common").toLowerCase(),
    });
  }
  return out;
}

// ── Mission hook called from win-battle paths ──
function onBattleWon(player) {
  ensureQuestFields(player);
  const quests = loadQuests();
  const completed = [];

  for (const [qId, active] of Object.entries(player.quests.active)) {
    const def = quests[qId];
    if (!def) continue;
    const req = def.requirement || {};

    // Top-level winBattles
    if (req.kind === "winBattles") {
      active.progress = Number(active.progress || 0) + 1;
      if (active.progress >= Number(req.count || 1)) completed.push(qId);
      continue;
    }

    // chain — bump the first incomplete winBattles step (only after earlier
    // steps complete in order)
    if (req.kind === "chain" && Array.isArray(req.steps)) {
      active.stepProgress = active.stepProgress || {};
      for (let i = 0; i < req.steps.length; i++) {
        const st = req.steps[i];
        const done = !!active.stepProgress[i];
        if (done) continue;
        if (st.kind !== "winBattles") break; // gated until earlier non-battle step done
        const cur = Number(active.stepProgress[`${i}_count`] || 0) + 1;
        active.stepProgress[`${i}_count`] = cur;
        if (cur >= Number(st.count || 1)) active.stepProgress[i] = true;
        break; // only one battle counted per win
      }
      if (allStepsDone(req.steps, active)) completed.push(qId);
    }
  }
  return completed;
}

// Mark an NPC-meet step as complete for any active quest whose next pending
// step matches the npc. Called by the hidden `.whisper <npc>` command.
function onNpcMeet(player, npcName) {
  ensureQuestFields(player);
  const quests = loadQuests();
  const advanced = [];
  const completed = [];

  for (const [qId, active] of Object.entries(player.quests.active)) {
    const def = quests[qId];
    if (!def) continue;
    const req = def.requirement || {};
    if (req.kind !== "chain" || !Array.isArray(req.steps)) continue;

    active.stepProgress = active.stepProgress || {};
    for (let i = 0; i < req.steps.length; i++) {
      const st = req.steps[i];
      if (active.stepProgress[i]) continue;
      if (st.kind !== "meetNpc") break; // gated
      if (String(st.npc).toLowerCase() === String(npcName).toLowerCase()) {
        active.stepProgress[i] = true;
        advanced.push({ qId, def, stepIdx: i, step: st });
        break;
      } else {
        // wrong npc for the next pending step — don't skip ahead
        break;
      }
    }
    if (allStepsDone(req.steps, active)) completed.push(qId);
  }
  return { advanced, completed };
}

function allStepsDone(steps, active) {
  const sp = active.stepProgress || {};
  for (let i = 0; i < steps.length; i++) {
    if (!sp[i]) return false;
  }
  return true;
}

// Render a single quest's detail block for messages (used by .quest, .open).
function renderQuestDetail(def) {
  if (!def) return "_(missing quest)_";
  const styles = loadStyles();
  const lines = [
    `📜 *${def.name}*  —  ${def.giver || "Unknown"}`,
    `_${def.lore || ""}_`,
    ``,
    `🎯 *Requirements:*`,
  ];
  const req = def.requirement || {};
  if (req.kind === "winBattles") {
    lines.push(`  • Win *${req.count}* battles`);
  } else if (req.kind === "chain" && Array.isArray(req.steps)) {
    req.steps.forEach((st, i) => {
      const label =
        st.label ||
        (st.kind === "meetNpc"   ? `Meet ${st.npc}` :
         st.kind === "winBattles" ? `Win ${st.count} battles` :
         st.kind === "deliverItem" ? `Deliver ${st.item} to ${st.to}` :
         st.kind);
      const hint = st.hint ? `\n     _${st.hint}_` : "";
      lines.push(`  ${i + 1}. ${label}${hint}`);
    });
  } else {
    lines.push(`  • ${req.kind || "unspecified"}`);
  }

  lines.push(``);
  const rewards = [];
  if (def.reward?.style) {
    const sn = styles[def.reward.style]?.name || def.reward.style;
    rewards.push(`🥋 Unlock *${sn}*`);
  }
  if (def.reward?.lucons) rewards.push(`💰 ${def.reward.lucons} Lucons`);
  if (def.reward?.riftPE) rewards.push(`🩸 +${def.reward.riftPE} Rift PE`);
  if (def.reward?.intelligence) rewards.push(`🧠 +${def.reward.intelligence} Intelligence`);
  lines.push(`🎁 *Reward:* ${rewards.join(" • ") || "—"}`);
  return lines.join("\n");
}

// Internal: apply rewards for a finished quest.
function applyCompletion(player, questId) {
  ensureQuestFields(player);
  const quests = loadQuests();
  const def = quests[questId];
  if (!def) return null;

  // Remove from active, push to completed
  delete player.quests.active[questId];
  if (!player.quests.completed.includes(questId)) player.quests.completed.push(questId);

  const rewards = def.reward || {};
  if (rewards.style && !player.styles.includes(rewards.style)) {
    player.styles.push(rewards.style);
    // First style unlocked becomes the equipped style automatically.
    if (!player.equippedStyle) player.equippedStyle = rewards.style;
  }
  if (rewards.lucons) {
    player.lucons = Number(player.lucons || 0) + Number(rewards.lucons);
  }
  if (rewards.riftPE) {
    player.riftPE = Math.min(100, Number(player.riftPE || 0) + Number(rewards.riftPE));
  }
  if (rewards.intelligence) {
    player.intelligence = Number(player.intelligence || 0) + Number(rewards.intelligence);
  }
  return def;
}

// ══════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════

async function cmdQuests(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  const quests = loadQuests();
  const styles = loadStyles();
  const all = Object.values(quests);

  const sections = [];
  // Active
  const active = Object.entries(player.quests.active);
  if (active.length) {
    sections.push(`📜 *ACTIVE QUESTS*\n${DIVIDER}`);
    for (const [qId, a] of active) {
      const def = quests[qId];
      if (!def) continue;
      // L-07 fix: chain quests progress per-step, not via a flat .count.
      // Render "X of N steps" instead of the old 0/undefined.
      const req = def.requirement || {};
      let progressLine;
      if (req.kind === "chain" && Array.isArray(req.steps)) {
        const sp = a.stepProgress || {};
        const done = req.steps.filter((_, i) => sp[i]).length;
        {
          let _hint = "";
          for (let si = 0; si < req.steps.length; si++) {
            if (sp[si]) continue;
            const st = req.steps[si];
            if (st.kind === "meetNpc") { _hint = String.fromCharCode(10) + String.fromCharCode(0x1f4ac) + " Next: *.whisper " + String(st.npc).toLowerCase() + "*"; break; }
            if (st.kind === "winBattles") {
              const cur = Number(sp[si + "_count"] || 0);
              _hint = String.fromCharCode(10) + String.fromCharCode(0x2694, 0xfe0f) + " Next: win *" + (st.count - cur) + "* more wild battles";
              if (st.hint) _hint += String.fromCharCode(10) + "   _" + st.hint + "_";
              break;
            }
          }
          progressLine += _hint;
        }
        progressLine = `  Progress: *${done}/${req.steps.length}* steps`;
      } else {
        const need = Number(req.count || 1);
        const have = Number(a.progress || 0);
        progressLine = `  Progress: *${have}/${need}* battle wins`;
      }
      sections.push(
        `• *${def.name}* — ${def.giver}\n${progressLine}\n  Reward: *${def.reward?.style ? `Unlock ${styles[def.reward.style]?.name || def.reward.style}` : "—"}*${def.reward?.lucons ? ` + ${def.reward.lucons} Lucons` : ""}`
      );
    }
  }
  // Available
  const available = all.filter((d) => !player.quests.active[d.id] && !player.quests.completed.includes(d.id));
  if (available.length) {
    sections.push(`\n📋 *AVAILABLE QUESTS*\n${DIVIDER}`);
    for (const d of available) {
      const styleName = d.reward?.style ? styles[d.reward.style]?.name || d.reward.style : null;
      const rewards = [];
      if (styleName) rewards.push(`unlock *${styleName}*`);
      if (d.reward?.lucons) rewards.push(`${d.reward.lucons} Lucons`);
      if (d.reward?.intelligence) rewards.push(`+${d.reward.intelligence} Intelligence`);
      if (d.reward?.riftPE) rewards.push(`+${d.reward.riftPE} Rift PE`);
      sections.push(
        `• *${d.name}* — ${d.giver}\n  _${d.lore}_\n  Reward: ${rewards.join(" • ") || "—"}\n  Accept: *.quest accept ${d.id}*`
      );
    }
  }
  // Completed
  if (player.quests.completed.length) {
    sections.push(`\n🏆 *COMPLETED*\n${DIVIDER}`);
    for (const qId of player.quests.completed) {
      const def = quests[qId];
      sections.push(`✓ ${def?.name || qId}`);
    }
  }
  if (!sections.length) sections.push("_No quests defined yet._");

  return sock.sendMessage(chatId, { text: sections.join("\n") }, { quoted: msg });
}

async function cmdQuest(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const sub = String(args[0] || "").toLowerCase();
  if (!sub || sub === "list") return cmdQuests(ctx, chatId, senderId, msg);

  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  if (sub === "accept") {
    const qId = String(args[1] || "").toLowerCase();
    const quests = loadQuests();
    const def = quests[qId];
    if (!def) {
      return sock.sendMessage(chatId, { text: `❌ No quest named *${qId}*.\nList with *.quests*.` }, { quoted: msg });
    }
    if (player.quests.completed.includes(qId)) {
      return sock.sendMessage(chatId, { text: `❌ You've already completed *${def.name}*.` }, { quoted: msg });
    }
    if (player.quests.active[qId]) {
      return sock.sendMessage(chatId, { text: `❌ *${def.name}* is already active.` }, { quoted: msg });
    }
    player.quests.active[qId] = { progress: 0, startedAt: Date.now(), stepProgress: {} };
    savePlayers(players);
    const req = def.requirement || {};
    let reqLine;
    if (req.kind === "chain" && Array.isArray(req.steps)) {
      reqLine = req.steps.map((st, i) =>
        `  ${i + 1}. ${st.label || (st.kind === "meetNpc" ? `Meet ${st.npc}` : `Win ${st.count} battles`)}`
      ).join("\n");
    } else {
      reqLine = `  Win *${Number(req.count || 1)}* battles`;
    }
    return sock.sendMessage(chatId, {
      text:
        `📜 *QUEST ACCEPTED*\n${DIVIDER}\n` +
        `*${def.name}*  —  ${def.giver}\n${DIVIDER}\n` +
        `_${def.lore}_\n\n` +
        `🎯 Requirement:\n${reqLine}\n` +
        `🎁 Reward: unlock *${loadStyles()[def.reward?.style]?.name || def.reward?.style || "—"}*` +
        (def.reward?.lucons ? ` + ${def.reward.lucons} Lucons` : ""),
    }, { quoted: msg });
  }

  if (sub === "abandon" || sub === "drop") {
    const qId = String(args[1] || "").toLowerCase();
    if (!player.quests.active[qId]) {
      return sock.sendMessage(chatId, { text: `❌ *${qId}* isn't active.` }, { quoted: msg });
    }
    delete player.quests.active[qId];
    savePlayers(players);
    return sock.sendMessage(chatId, { text: `🚪 Abandoned quest: *${qId}*.` }, { quoted: msg });
  }

  return sock.sendMessage(chatId, {
    text:
      `📜 *.quest* — quest log\n${DIVIDER}\n` +
      `• *.quest list* — same as *.quests*\n` +
      `• *.quest accept <id>* — accept a quest\n` +
      `• *.quest abandon <id>* — drop an active quest`,
  }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// STARTER STYLE PICKER  (v0.9.0)
// At .start, every new player picks one of 3 starter fighting styles.
// ══════════════════════════════════════════════════════════════
const STARTER_STYLE_OPTIONS = ["wind_step", "sun_walk", "tide_veil"];

async function cmdChooseStyle(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  if (player.starterStyleChosen) {
    return sock.sendMessage(chatId, {
      text: `✅ You already chose your starter style. View it with *.styles*.`,
    }, { quoted: msg });
  }

  const styles = loadStyles();
  const options = STARTER_STYLE_OPTIONS.map((sid) => styles[sid]).filter(Boolean);
  const pick = parseInt(args[0], 10);
  if (!Number.isFinite(pick) || pick < 1 || pick > options.length) {
    const labelToCmd = {};
    options.forEach((s, i) => {
      labelToCmd[`🥋 ${i + 1}. ${s.name}`] = `.choose-style ${i + 1}`;
    });
    buttonsSystem.mapButtons(labelToCmd);
    const lines = options.map((s, i) => {
      const moves = (s.moves || []).map((m) => m.name).join(" • ");
      return `${i + 1}. 🥋 *${s.name}* _(${s.type})_\n   Moves: ${moves}`;
    });
    return buttonsSystem.sendButtons(sock, chatId,
      `🥋 *CHOOSE YOUR STARTER STYLE*\n${DIVIDER}\n` +
      `_Unlock more styles later by finding scrolls._\n` +
      lines.join("\n") +
      `\n\n👉 Tap below 👇`,
      options.map((s, i) => `🥋 ${i + 1}. ${s.name}`),
      { footer: `Or type: .choose-style 1-${options.length}`, quoted: msg }
    );
  }

  const chosen = options[pick - 1];
  if (!player.styles.includes(chosen.id)) player.styles.push(chosen.id);
  if (!player.equippedStyle) player.equippedStyle = chosen.id;
  player.starterStyleChosen = true;
  savePlayers(players);

  buttonsSystem.mapButtons({ "💎 Pick a Shard": `.choose-shard` });
  return buttonsSystem.sendButtons(sock, chatId,
    `🥋 *STARTER STYLE LEARNED*\n${DIVIDER}\n` +
    `*${chosen.name}* — ${chosen.type}\n` +
    `_${chosen.lore}_\n\n` +
    `Moves added to your *.attack* list:\n` +
    (chosen.moves || []).map((m) => `• *${m.name}*`).join("\n") +
    `\n\nNext: pick your *starter shard* 👇`,
    ["💎 Pick a Shard"],
    { footer: `Or type: .choose-shard`, quoted: msg }
  );
}

async function cmdStyles(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  const styles = loadStyles();
  const ownedIds = player.styles || [];
  const equippedId = getEquippedStyleId(player);

  const lines = Object.values(styles).map((s) => {
    const owned = ownedIds.includes(s.id);
    const status = owned
      ? (equippedId === s.id
          ? "✅ *EQUIPPED* — active in combat"
          : "🔓 unlocked — *.equip-style <name>* to use it")
      : `🔒 quest: *.quest accept ${s.unlockQuest}*`;
    return (
      `• *${s.name}*  _(${s.type})_  — ${status}\n` +
      `  _${s.lore}_\n` +
      `  Moves: ${s.moves.map((m) => `*${m.name}*`).join(", ")}`
    );
  });

  return sock.sendMessage(chatId, {
    text:
      `🥋 *FIGHTING STYLES*\n${DIVIDER}\n` +
      lines.join(`\n\n`) +
      `\n${DIVIDER}\n` +
      `_Look up a style's art with *.style <name>*_\n` +
      `_Only your *EQUIPPED* style fights in *.attack* — switch anytime with *.equip-style <name>*._`,
  }, { quoted: msg });
}

// .equip-style <name> — switch the ONE style active in combat.
// Unlocks are kept in p.styles; only p.equippedStyle feeds the moveset.
async function cmdEquipStyle(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  const q = args.join(" ").trim().toLowerCase();
  if (!q) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.equip-style <name>*\nExample: *.equip-style tenebris* — see your styles with *.styles*`,
    }, { quoted: msg });
  }

  const styles = loadStyles();
  const st =
    Object.values(styles).find((s) => s.id === q) ||
    Object.values(styles).find((s) => s.name.toLowerCase() === q) ||
    Object.values(styles).find((s) => s.name.toLowerCase().includes(q)) ||
    null;
  if (!st) {
    return sock.sendMessage(chatId, { text: `❌ No fighting style named *${q}*.\nSee all with *.styles*.` }, { quoted: msg });
  }

  if (!player.styles.includes(st.id)) {
    return sock.sendMessage(chatId, {
      text: `❌ You haven’t unlocked *${st.name}* yet.
Quest: *.quest accept ${st.unlockQuest}*`,
    }, { quoted: msg });
  }

  player.equippedStyle = st.id;
  savePlayers(players);

  const moves = (st.moves || []).map((m) => `• *${m.name}* — ${m.desc || ""}`).join("\n");
  const eqText =
    `🥋 *STYLE EQUIPPED*\n${DIVIDER}\n` +
    `✅ Now fighting in *${st.name}* _(${st.type})_.\n` +
    (moves ? `\n*Moves now in .attack:*\n${moves}\n` : "") +
    `${DIVIDER}\n` +
    `_Equip a different style anytime: *.equip-style <name>*_`;

  const eqImg = styleImagePath(st.id);
  if (eqImg) {
    try {
      return await sock.sendMessage(chatId, {
        image: fs.readFileSync(eqImg),
        caption: eqText,
      }, { quoted: msg });
    } catch { /* fall through to text */ }
  }
  return sock.sendMessage(chatId, { text: eqText }, { quoted: msg });
}

// .style <name> — deep-dive on ONE fighting style: art (if dropped),
// lore, moves, and the quest that unlocks it. This is the "scroll found →
// look it up" flow Prime asked for: styles carry an image that also serves
// as the Lumora Roblox game icon.
async function cmdStyleDetail(ctx, chatId, senderId, msg, args = []) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  const q = args.join(" ").trim().toLowerCase();
  if (!q) {
    return sock.sendMessage(chatId, {
      text: `❌ Usage: *.style <name>*\nExample: *.style tenebris* — or see all with *.styles*`,
    }, { quoted: msg });
  }

  const styles = loadStyles();
  const st =
    Object.values(styles).find((s) => s.id === q) ||
    Object.values(styles).find((s) => s.name.toLowerCase() === q) ||
    Object.values(styles).find((s) => s.name.toLowerCase().includes(q)) ||
    null;
  if (!st) {
    return sock.sendMessage(chatId, { text: `❌ No fighting style named *${q}*.\nSee all with *.styles*.` }, { quoted: msg });
  }

  const owned = player.styles.includes(st.id);
  const quests = loadQuests();
  const questDef = quests[st.unlockQuest];
  const rarityIcon =
    st.rarity === "legendary" ? "🌟" :
    st.rarity === "epic" ? "💎" :
    st.rarity === "rare" ? "✨" : "🥋";

  const moves = (st.moves || []).map((m) => {
    const tags = [];
    if (m.selfHeal) tags.push(`heal ${m.selfHeal}`);
    if (m.brace) tags.push(`brace`);
    if (m.counter) tags.push(`counter ${m.counter}`);
    if (m.energyRestore) tags.push(`+${m.energyRestore} EN`);
    if (m.neverMisses) tags.push(`never misses`);
    return `• *${m.name}*  (${m.power ? `${m.power} dmg, ` : ""}${m.energyCost} EN)${tags.length ? ` _[${tags.join(", ")}]_` : ""}\n     _${m.desc}_`;
  });

  const howTo = owned
      ? `✅ *UNLOCKED* — appears in your *.attack* moveset.`
      : questDef
      ? `🔒 *Not yet unlocked.*\n` +
        `Quest: *.quest accept ${questDef.id}*  —  _${questDef.name}_ (${questDef.giver})\n` +
        `Find the scroll, then open it: scroll drops while hunting, open with *.open <scroll name>*`
      : `🔒 *Not yet unlocked.*`;

  const text =
    `${rarityIcon} *${st.name}*  _(${st.type} • ${st.rarity})_\n${DIVIDER}\n` +
    `_${st.lore}_\n${DIVIDER}\n` +
    `*Moves:*\n${moves.join("\n") || "_(none)_"}\n${DIVIDER}\n` +
    (st.faction ? `🏴 Faction: *${st.faction}*\n` : `🌐 Any faction\n`) +
    howTo;

  const imagePath = styleImagePath(st.id);
  if (imagePath) {
    try {
      return await sock.sendMessage(chatId, {
        image: fs.readFileSync(imagePath),
        caption: text,
      }, { quoted: msg });
    } catch {
      // image send failed — fall through to plain text
    }
  }
  return sock.sendMessage(chatId, { text }, { quoted: msg });
}

// ══════════════════════════════════════════════════════════════
// HIDDEN COMMANDS  (DM-revealed when a scroll is opened)
// ══════════════════════════════════════════════════════════════
async function cmdWhisper(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  ensureQuestFields(player);

  const npcRaw = args.join(" ").trim();
  if (!npcRaw) {
    return sock.sendMessage(chatId, { text: `Whisper to whom? Try *.whisper <npc>*.` }, { quoted: msg });
  }

  // Verify the NPC is part of an active quest's hiddenCommands AND matches
  // a pending meetNpc step. Both gates must pass.
  const quests = loadQuests();
  let matchedDef = null;
  for (const qId of Object.keys(player.quests.active)) {
    const def = quests[qId];
    if (!def?.hiddenCommands) continue;
    const npcKey = Object.keys(def.hiddenCommands).find(
      (k) => k.toLowerCase() === npcRaw.toLowerCase()
    );
    if (npcKey) { matchedDef = { def, npc: npcKey, info: def.hiddenCommands[npcKey] }; break; }
  }
  if (!matchedDef) {
    return sock.sendMessage(chatId, {
      text: `🌫 No one answers. The name dissolves in the air.`,
    }, { quoted: msg });
  }

  const { advanced, completed } = onNpcMeet(player, matchedDef.npc);
  savePlayers(players);

  const lines = [];
  if (advanced.length) {
    lines.push(`🌟 *${matchedDef.npc}* meets your gaze.`);
    lines.push(`> _"${matchedDef.info.phrase}"_`);
    lines.push(``);
    for (const a of advanced) {
      lines.push(`📜 *${a.def.name}* — step ${a.stepIdx + 1} complete: ${a.step.label || `Meet ${a.step.npc}`}`);
    }
  } else {
    lines.push(`*${matchedDef.npc}* nods, but the moment passes — that step is already done or not yet open.`);
  }

  // Auto-apply completions
  for (const qId of completed) {
    const def = applyCompletion(player, qId);
    if (def) {
      const styleName = loadStyles()[def.reward?.style]?.name || def.reward?.style;
      lines.push(``);
      lines.push(`🏆 *QUEST COMPLETE — ${def.name}*`);
      lines.push(`_${def.completedFlavor || ""}_`);
      if (def.reward?.style)        lines.push(`🥋 Style unlocked: *${styleName}*`);
      if (def.reward?.lucons)       lines.push(`💰 +${def.reward.lucons} Lucons`);
      if (def.reward?.intelligence) lines.push(`🧠 +${def.reward.intelligence} Intelligence`);
      if (def.reward?.riftPE)       lines.push(`🩸 +${def.reward.riftPE} Rift PE`);
    }
  }
  savePlayers(players);

  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

module.exports = {
  // commands
  cmdQuests,
  cmdQuest,
  cmdStyles,
  cmdStyleDetail,
  cmdChooseStyle,
  cmdWhisper,

  // commands
  cmdEquipStyle,

  // hooks
  onBattleWon,
  onNpcMeet,
  applyCompletion,
  renderQuestDetail,

  // helpers
  ensureQuestFields,
  getUnlockedStyleMoves,
  getEquippedStyleId,
  loadQuests,
  loadStyles,
  reloadCatalog,
  getRarityBuff,
  STYLE_RARITY_BUFF,
  styleImagePath,
};
