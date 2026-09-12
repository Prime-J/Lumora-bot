// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA DISCOVERIES  v1.1.0 (M4)                               ║
// ║  Themed "mysterious cave" style encounters layered on .hunt /  ║
// ║  .proceed. One discovery pending at a time; state lives in the ║
// ║  hunter record (hunting.js's own state file) — one owner.      ║
// ║  Ignoring a discovery is safe: the next hunt resolves/replaces ║
// ║  it. LEAVE always costs nothing. No dead ends.                 ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs = require("fs");
const path = require("path");

const SDIV = "━━━━━━━━━━━━━━━━━━━━━━━━━";

let _cfg = null;
function loadConfig() {
  if (_cfg) return _cfg;
  try { _cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "discoveries.json"), "utf-8")); }
  catch { _cfg = { chance: 0, themes: {}, outcomeWeights: {}, lucons: {}, battle: {} }; }
  return _cfg;
}

function themeFor(ground) {
  const cfg = loadConfig();
  const key = String(ground?.type || "").toLowerCase();
  return cfg.themes[key] || cfg.themes._default || { name: "a mysterious cave", text: "Stone opens before you.", battleType: null };
}

// ── Roll: does this hunt surface a discovery? ──────────────────
// Modest base chance; boosted when the player's active style trial
// still needs materials (the M3 grind loop's payoff moment).
function rollDiscovery(player, ground) {
  const cfg = loadConfig();
  const base = Number(cfg.chance || 0);
  if (base <= 0) return null;
  let chance = base;
  try {
    const sq = require("./styleQuests");
    if (sq.hasOpenTrialNeed(player)) chance += Number(cfg.trialBonusChance || 0);
  } catch {}
  if (Math.random() >= chance) return null;
  const theme = themeFor(ground);
  return {
    themeKey: String(ground?.type || "default"),
    place: theme.name,
    text: theme.text,
    battleType: theme.battleType || null,
    at: Date.now(),
    groundId: ground?.id || null,
  };
}

// Pending state lives on the hunter record and expires after 30 minutes
// of silence — never a stuck state.
function getPending(hunter) {
  const disc = hunter?.pendingDiscovery;
  if (!disc) return null;
  if (Date.now() - Number(disc.at || 0) > 30 * 60 * 1000) hunter.pendingDiscovery = null;
  return hunter.pendingDiscovery;
}
function setPending(hunter, disc) { hunter.pendingDiscovery = disc; }
function clearPending(hunter) { hunter.pendingDiscovery = null; }
function weightedPick(pairs) {
  const total = pairs.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pairs) { r -= p.weight; if (r <= 0) return p.value; }
  return pairs[pairs.length - 1]?.value;
}

// ── ENTER: data-driven outcome ─────────────────────────────────
async function cmdEnter(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const hunting = require("./hunting");
  const state = hunting.loadHuntState();
  const hunter = hunting.ensureHunter(state, senderId);
  const disc = getPending(hunter);
  const player = players[senderId];
  if (!player) return sock.sendMessage(chatId, { text: "❌ Use *.register* first." }, { quoted: msg });
  if (!disc) {
    return sock.sendMessage(chatId, { text: "❌ No discovery awaits. Keep hunting — *.hunt*" }, { quoted: msg });
  }


  const cfg = loadConfig();
  const outcome = weightedPick(
    Object.entries(cfg.outcomeWeights || { material: 40, lucons: 35, battle: 25 })
      .map(([value, weight]) => ({ value, weight: Number(weight) }))
  );

  // 1) MATERIAL — prefer the active trial's still-needed materials (M3 payoff)
  if (outcome === "material") {
    let matName = null;
    try {
      const sq = require("./styleQuests");
      const mat = sq.rollQuestMaterial(player, { forced: true });
      if (mat) {
        require("./items").addItem(player, mat.id, 1);
        matName = mat.name;
      }
    } catch {}
    if (!matName) {
      // no open trial need → guaranteed fallback material from the item pool
      const fallback = ["MAT_002", "MAT_003", "CRY_002"][Math.floor(Math.random() * 3)];
      require("./items").addItem(player, fallback, 1);
      matName = require("./items").getItemById?.(fallback)?.name || fallback;
    }
    savePlayers(players); hunting.hunting.saveHuntState(state);
    return sock.sendMessage(chatId, {
      text:
        `🚪 *You enter ${disc.place}...*\n${SDIV}\n` +
        `✨ Deep within, resting on a stone that does not belong:\n` +
        `📦 *${matName}* — gained!\n\n` +
        `_The dark keeps the rest of its secrets. Hunt on._`,
    }, { quoted: msg });
  }

  // 2) LUCONS — scaled by difficulty
  if (outcome === "lucons") {
    const diffKey = String(hunter.currentDifficulty || "easy").toLowerCase();
    const mult = { easy: 1, medium: 2, hard: 3, extreme: 4 }[diffKey] || 1;
    const lc = Math.round(
      (Number(cfg.lucons?.min || 150) + Math.random() * (Number(cfg.lucons?.max || 600) - Number(cfg.lucons?.min || 150)))
      + Number(cfg.lucons?.perDifficulty || 50) * (mult - 1)
    );
    player.lucons = Number(player.lucons || 0) + lc;
    savePlayers(players); hunting.hunting.saveHuntState(state);
    return sock.sendMessage(chatId, {
      text:
        `🚪 *You enter ${disc.place}...*\n${SDIV}\n` +
        `💰 A hunter's cache, long unclaimed: *+${lc} Lucons*\n` +
        `Balance: *${player.lucons} LC*\n\n_Whoever left it no longer needs it._`,
    }, { quoted: msg });
  }

  // 3) BATTLE — area-appropriate guardian via the real battle engine
  const battleType = disc.battleType;
  const moraDb = typeof ctx.loadMora === "function" ? ctx.loadMora() : [];
  const pool = battleType ? moraDb.filter((m) => String(m.type) === battleType) : moraDb;
  const species = pool.length ? pool[Math.floor(Math.random() * pool.length)] : moraDb[Math.floor(Math.random() * moraDb.length)];
  if (!species) {
    // engine can't run — pay lucons instead so the enter never dead-ends
    player.lucons = Number(player.lucons || 0) + 200;
    savePlayers(players); hunting.hunting.saveHuntState(state);
    return sock.sendMessage(chatId, { text: `🚪 The depths are empty — but an old stash yields *+200 Lucons*.` }, { quoted: msg });
  }
  const diffKey = String(hunter.currentDifficulty || "easy").toLowerCase();
  const dmult = { easy: 0, medium: 1, hard: 2, extreme: 3 }[diffKey] || 0;
  const level = Math.max(2, Number(cfg.battle?.levelBase || 3) + Number(player.level || 1) + dmult * Number(cfg.battle?.levelPerDifficulty || 2));
  hunting.saveHuntState(state);
  return require("./wildbattle").startWildBattle(ctx, chatId, senderId, msg, {
    baseId: String(species.id),
    level,
    allowCapture: false,
    discoveryGuardian: { place: disc.place },
  });
}

// ── LEAVE: costs nothing, always safe ──────────────────────────
async function cmdLeave(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const hunting = require("./hunting");
  const state = hunting.loadHuntState();
  const hunter = hunting.ensureHunter(state, senderId);
  const disc = getPending(hunter);
  clearPending(hunter);
  hunting.hunting.saveHuntState(state);
  if (!disc) {
    return sock.sendMessage(chatId, { text: "❌ No discovery awaits. Keep hunting — *.hunt*" }, { quoted: msg });
  }
  return sock.sendMessage(chatId, {
    text: `↩️ *You leave ${disc.place} undisturbed.*\n_The wild will offer again someday. Costs you nothing._`,
  }, { quoted: msg });
}


module.exports = {
  loadConfig,
  rollDiscovery,
  getPending,
  setPending,
  clearPending,
  cmdEnter,
  cmdLeave,
};
