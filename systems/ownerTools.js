// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA OWNER TOOLBOX  v1.0                                    ║
// ║  One router: .ow <sub> ... — Owner-only (settings.ownerNumbers)║
// ║  Lets the Architect do ANYTHING: currencies, shards, merges,   ║
// ║  players, factions, raids, settings, bans, and raw eval.       ║
// ║  Registered EARLY in index.js so it works even mid-battle.     ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━";
const DATA_DIR = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const BANS_FILE = path.join(DATA_DIR, "bans.json");
const TREASURY_FILE = path.join(DATA_DIR, "faction_treasury.json");
const FACTION_POINTS_FILE = path.join(DATA_DIR, "faction_points.json");
const RAID_STATE_FILE = path.join(DATA_DIR, "auto_raid_state.json");

const FACTIONS = ["harmony", "purity", "rift"];
const FACTION_LABEL = { harmony: "🌿 Harmony", purity: "⚔️ Purity Order", rift: "🕶️ Rift Seekers" };

// ── toolbox-owned subs (anything else falls through to legacy owner cmds) ──
const TOOLBOX_SUBS = new Set([
  "help", "h", "menu", "count", "lookup", "find", "eval", "js",
  "lcr", "lucons", "money", "reob", "orbs", "resonance", "int", "intelligence", "iq",
  "points", "statpoints", "xp", "riftpe",
  "shard", "giveshard", "shards-give", "shards", "vault", "shards-clear", "clear-shards",
  "storage", "merge", "awaken", "shed", "unmerge",
  "hp", "heal", "energy", "stamina", "level", "lv", "faction", "setfaction",
  "style", "styles-give", "styles", "styles-list", "catalog", "style-clear", "switch", "switch-style", "quest", "item", "items-give",
  "player", "inspect", "reset", "wipe", "ban", "unban",
  "spawns", "spawn", "raid", "raid-reset", "fgroup", "factiongroup",
  "treasury", "facpts", "factionpoints", "settings",
  "test", "test-mode", "testmode",
]);

function isToolboxCommand(sub) {
  return TOOLBOX_SUBS.has(String(sub || "").toLowerCase());
}

// ── file helpers ────────────────────────────────────────────────
function loadJSON(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fb; }
}
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)); }

function loadSettingsFile() { return loadJSON(SETTINGS_FILE, {}); }
function saveSettingsFile(s) { saveJSON(SETTINGS_FILE, s); }
function loadBans() { return loadJSON(BANS_FILE, {}); }
function saveBans(b) { saveJSON(BANS_FILE, b); }

// ── target resolution (mention > reply > number arg) ─────────────
function resolveTargetJid(args, helpers, msg) {
  const mentioned = helpers.getMentionedJids ? helpers.getMentionedJids(msg) : [];
  if (mentioned && mentioned.length) return mentioned[0];
  const replied = helpers.getRepliedJid ? helpers.getRepliedJid(msg) : null;
  if (replied) return replied;
  // Find the first numeric token that looks like a phone number
  for (const a of args) {
    const t = helpers.toUserJidFromArg ? helpers.toUserJidFromArg(a) : null;
    if (t) return t;
  }
  return null;
}

function normJidSafe(jid = "") {
  return String(jid || "").split(":")[0];
}

// Species lookup: exact id/name first, then prefix, then substring.
function resolveSpecies(loadMora, query) {
  if (!query) return null;
  const list = loadMora();
  const q = String(query).toLowerCase().trim();
  if (!q) return null;
  return (
    list.find((m) => String(m.id).toLowerCase() === q || String(m.name).toLowerCase() === q) ||
    list.find((m) => String(m.name).toLowerCase().startsWith(q)) ||
    list.find((m) => String(m.name).toLowerCase().includes(q)) ||
    null
  );
}

function getNumberArg(args) {
  for (const a of args) {
    const n = Number(String(a).replace(/[,+]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ── command send helper ─────────────────────────────────────────
function send(sock, chatId, text, mentions = []) {
  return sock.sendMessage(chatId, { text, mentions }, { quoted: undefined });
}

// ══════════════════════════════════════════════════════════════
// MAIN ROUTER
// ══════════════════════════════════════════════════════════════
async function cmdOwnerTools(ctx, chatId, senderId, msg, args = [], helpers = {}) {
  const { sock, players, savePlayers, loadMora } = ctx;

  // Owner gate — defense in depth.
  if (!ctx.isOwner) {
    return send(sock, chatId, "❌ Architect-only toolbox.");
  }

  const sub = String(args[0] || "").toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    // ── Help / meta ─────────────────────────────────────────
    case "help": case "h": case "": case "menu":
      return cmdHelp(ctx, chatId, senderId, msg, args, helpers);
    case "count":
      return send(sock, chatId, `👥 Registered players: *${Object.keys(players).length}*`);
    case "lookup": case "find": {
      const q = rest.join(" ");
      if (!q) return send(sock, chatId, "❌ Usage: `.ow lookup <number>`");
      const digits = q.replace(/\D/g, "");
      const hit = Object.entries(players).find(([jid]) => jid.replace(/\D/g, "").endsWith(digits) || digits.endsWith(jid.split("@")[0].replace(/\D/g, "")));
      if (!hit) return send(sock, chatId, `❌ No player matches *${q}*.`);
      const p = hit[1];
      return send(sock, chatId,
        `🔍 *PLAYER LOOKUP*\n${DIVIDER}\n` +
        `📱 ${hit[0].split("@")[0]}\n` +
        `👤 ${p.name || p.username || "?"}\n` +
        `📊 Lv ${p.level || 1}  •  ${p.faction ? FACTION_LABEL[p.faction] || p.faction : "no faction"}\n` +
        `💰 ${p.lucons || 0} Lucons  •  💎 ${Object.keys(p.shards || {}).length} shard type(s)`);
    }
    case "eval": case "js":
      return cmdEval(ctx, chatId, senderId, rest.join(" "));

    // ── Test mode ────────────────────────────────────────────
    case "test": case "test-mode": case "testmode":
      return cmdTestMode(ctx, chatId, senderId, msg, rest);

    // ── Currencies ───────────────────────────────────────────
    case "lcr": case "lucons": case "money":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "lucons");
    case "reob": case "orbs":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "reob");
    case "resonance":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "resonance");
    case "int": case "intelligence": case "iq":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "intelligence");
    case "points": case "statpoints":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "statPoints");
    case "xp":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "xp");
    case "riftpe":
      return cmdCurrency(ctx, chatId, senderId, msg, rest, helpers, "riftPE");

    // ── Shards / merge ───────────────────────────────────────
    case "shard": case "giveshard": case "shards-give":
      return cmdGiveShard(ctx, chatId, senderId, msg, rest, helpers);
    case "shards": case "vault":
      return cmdShowShards(ctx, chatId, senderId, msg, rest, helpers);
    case "shards-clear": case "clear-shards":
      return cmdClearShards(ctx, chatId, senderId, msg, rest, helpers);
    case "storage":
      return cmdSetStorage(ctx, chatId, senderId, msg, rest, helpers);
    case "merge": case "awaken":
      return cmdForceMerge(ctx, chatId, senderId, msg, rest, helpers);
    case "shed": case "unmerge":
      return cmdForceShed(ctx, chatId, senderId, msg, rest, helpers);

    // ── Player state ─────────────────────────────────────────
    case "hp": case "heal":
      return cmdHp(ctx, chatId, senderId, msg, rest, helpers);
    case "energy": case "stamina":
      return cmdEnergy(ctx, chatId, senderId, msg, rest, helpers);
    case "level": case "lv":
      return cmdLevel(ctx, chatId, senderId, msg, rest, helpers);
    case "faction": case "setfaction":
      return cmdFaction(ctx, chatId, senderId, msg, rest, helpers);
    case "style": case "styles-give":
      return cmdStyle(ctx, chatId, senderId, msg, rest, helpers);
    case "switch": case "switch-style":
      return cmdSwitchStyle(ctx, chatId, senderId, msg, rest, helpers);
    case "styles":
      return cmdShowStyles(ctx, chatId, senderId, msg, rest, helpers);
    case "styles-list": case "catalog":
      return cmdListAllStyles(ctx, chatId, senderId, msg, rest, helpers);
    case "style-clear":
      return cmdClearStyles(ctx, chatId, senderId, msg, rest, helpers);
    case "quest":
      return cmdCompleteQuest(ctx, chatId, senderId, msg, rest, helpers);
    case "item": case "items-give":
      return cmdGiveItem(ctx, chatId, senderId, msg, rest, helpers);
    case "player": case "inspect":
      return cmdInspect(ctx, chatId, senderId, msg, rest, helpers);
    case "reset": case "wipe":
      return cmdResetPlayer(ctx, chatId, senderId, msg, rest, helpers);
    case "ban":
      return cmdBan(ctx, chatId, senderId, msg, rest, helpers, true);
    case "unban":
      return cmdBan(ctx, chatId, senderId, msg, rest, helpers, false);

    // ── Game control ─────────────────────────────────────────
    case "spawns": case "spawn":
      return cmdSpawns(ctx, chatId, rest);
    case "raid":
      return cmdRaid(ctx, chatId, rest);
    case "raid-reset":
      return cmdRaidReset(ctx, chatId);
    case "fgroup": case "factiongroup":
      return cmdFactionGroup(ctx, chatId, rest);
    case "treasury":
      return cmdTreasury(ctx, chatId, rest);
    case "facpts": case "factionpoints":
      return cmdFacPts(ctx, chatId, rest);
    case "settings":
      return cmdSettings(ctx, chatId, rest);

    default:
      return send(sock, chatId,
        `❌ Unknown tool: *.ow ${sub}*\n` +
        `Run *.ow help* for the full toolbox.`);
  }
}

// ══════════════════════════════════════════════════════════════
// IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════

function cmdHelp(ctx, chatId, senderId, msg, args, helpers) {
  const { sock } = ctx;
  return send(sock, chatId,
    `👑 *OWNER TOOLBOX*  _(Architect only)_\n${DIVIDER}\n` +
    `*💰 Currencies*  _(@user or number)_\n` +
    `  .ow lcr @u 500  •  .ow lcr set @u 500\n` +
    `  .ow reob / resonance / int / points / xp / riftpe  <@u> <amt>\n` +
    `${DIVIDER}\n` +
    `*💎 Shards & merge*\n` +
    `  .ow shard @u <name> [count] [corrupted]\n` +
    `  .ow shards @u  •  .ow shards-clear @u\n` +
    `  .ow storage @u <name> <cap>  •  .ow merge @u <name>  •  .ow shed @u\n` +
    `${DIVIDER}\n` +
    `*🧍 Player*\n` +
    `  .ow hp @u <hp|full>  •  .ow energy @u <amt>  •  .ow level @u <lv>\n` +
    `  .ow faction @u <harmony|purity|rift|none>\n` +
    `  .ow style [@u] <styleId>  •  .ow switch [@u] <styleId>  •  .ow styles-list  •  .ow styles [@u]  •  .ow style-clear [@u]\n` +
    `  .ow quest @u <questId>  •  .ow item @u <name> <qty>\n` +
    `  .ow player @u  •  .ow reset @u confirm\n` +
    `  .ow ban @u <hours> [reason]  •  .ow unban @u\n` +
    `${DIVIDER}\n` +
    `*🎮 Game control*\n` +
    `  .ow spawns on|off|status  •  .ow raid on|off|status|reset\n` +
    `  .ow fgroup <faction> <groupId>  •  .ow treasury <faction> <amt>\n` +
    `  .ow facpts <faction> <amt>  •  .ow settings get <key>  •  .ow settings set <key> <json>\n` +
    `${DIVIDER}\n` +
    `*🔧 Meta*\n` +
    `  .ow count  •  .ow lookup <num>  •  .ow eval <js>\n` +
    `${DIVIDER}\n` +
    `*♻️ Legacy owner commands (merged — works via .ow too)*\n` +
    `  Moderation: .ow punish/forgive/warn/unwarn/kick/promote/demote/announce/tagall/ban/unban\n` +
    `  Staff: .ow throne/unthrone/sudo/sudolist/players\n` +
    `  Faction: .ow owner-fac-p/addfacpts/setfacstyle/setfacreward/endseason\n` +
    `  Star: .ow star-on/off/mode/stats/reset/ping/bestie\n` +
    `  Control: .ow spawn-on/off/status, set-gauge, give-orb, refill --hunt-energy, reset-stats\n` +
    `  Groups: .ow moragroups/huntgroups/marketgroups/arena-toggle + add/remove/on/off variants\n` +
    `  Pro: .ow pro-grant/pros  •  Creation: .ow creations/approve-mora/reject-mora\n` +
    `  Misc: .ow ownercheck/update-release/orders/order-del/bank-remove/setlinkdesc/war\n` +
    `${DIVIDER}\n` +
    `_.ow eval_ is a live JS sandbox with ctx/players/savePlayers in scope — absolute power, use with care.`);
}

// ── currencies ──────────────────────────────────────────────────
async function cmdCurrency(ctx, chatId, senderId, msg, args, helpers, field) {
  const { sock, players, savePlayers } = ctx;

  let mode = "add";
  let targetArgs = args;
  if (String(args[0] || "").toLowerCase() === "set") {
    mode = "set";
    targetArgs = args.slice(1);
  }

  const targetJid = resolveTargetJid(targetArgs, helpers, msg);
  const amt = getNumberArg(targetArgs);

  if (!targetJid || !players[targetJid]) {
    return send(sock, chatId, `❌ Usage: *.ow ${args[0] ? "lcr" : field} [set] @user <amount>*`);
  }
  if (amt === null || !Number.isFinite(amt) || amt < 0) {
    return send(sock, chatId, `❌ Amount must be a positive number.`);
  }

  const p = players[targetJid];
  const old = Number(p[field] || 0);
  const next = mode === "set" ? amt : old + amt;
  p[field] = next;
  savePlayers(players);

  return send(sock, chatId,
    `💰 *OWNER GRANT — ${field.toUpperCase()}*\n${DIVIDER}\n` +
    `@${targetJid.split("@")[0]}: ${field} *${old} → ${next}* (${mode === "set" ? "set" : "+" + amt})\n` +
    `_Signed: The Architect._`,
    [targetJid]);
}

// ── shards ──────────────────────────────────────────────────────
async function cmdGiveShard(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, loadMora, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");

  // name = first non-numeric token; count = first numeric; corrupted flag
  let wantCorrupted = false;
  const nameTokens = [];
  let count = 1;
  for (const a of args) {
    const low = String(a).toLowerCase();
    if (low === "corrupted") { wantCorrupted = true; continue; }
    const n = Number(a);
    if (Number.isFinite(n) && n > 0) { count = n; continue; }
    if (String(a).startsWith("@")) continue; // mention token
    nameTokens.push(a);
  }
  const name = nameTokens.join(" ");
  const species = resolveSpecies(loadMora, name);
  if (!species) return send(sock, chatId, `❌ No Mora named *${name}*.`);
  if (!shardSystem.isMergeable(species)) {
    return send(sock, chatId, `❌ *${species.name}* isn't mergeable — no shard exists.`);
  }

  const p = players[targetJid];
  shardSystem.ensureShardFields(p);
  const key = shardSystem.shardKey(species, { corrupted: wantCorrupted });
  p.shards[key] = Number(p.shards[key] || 0) + count;
  savePlayers(players);

  const tag = wantCorrupted ? " ☠CORRUPTED" : "";
  return send(sock, chatId,
    `💎 *SHARD GRANT*\n${DIVIDER}\n` +
    `@${targetJid.split("@")[0]} +${count} × *${species.name}*${tag}\n` +
    `Vault now: *${p.shards[key]}*`,
    [targetJid]);
}

async function cmdShowShards(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, loadMora, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  shardSystem.ensureShardFields(p);
  const entries = Object.entries(p.shards).filter(([, n]) => n > 0);
  if (!entries.length) {
    return send(sock, chatId, `💎 @${targetJid.split("@")[0]}'s vault is *empty*.`, [targetJid]);
  }
  const lines = entries.map(([k, n]) => {
    const corrupted = shardSystem.isCorruptedKey(k);
    const base = shardSystem.stripCorrupted(k);
    const sp = resolveSpecies(loadMora, base);
    return `• *${sp?.name || base}*${corrupted ? " ☠" : ""}  ×${n}/${shardSystem.getStorageCap(p, k)}`;
  });
  const merge = shardSystem.getCurrentMerge(p);
  return send(sock, chatId,
    `💎 *VAULT — @${targetJid.split("@")[0]}*\n${DIVIDER}\n` +
    lines.join("\n") +
    (merge ? `\n${DIVIDER}\n🌀 Merged as *${merge.name}*` : ""),
    [targetJid]);
}

async function cmdClearShards(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  shardSystem.ensureShardFields(p);
  const before = Object.keys(p.shards || {}).length;
  p.shards = {};
  p.currentMerge = null;
  savePlayers(players);
  return send(sock, chatId,
    `🧹 *SHARDS WIPED*\n@${targetJid.split("@")[0]} cleared (${before} types). Merge dropped.`,
    [targetJid]);
}

async function cmdSetStorage(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, loadMora, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const cap = getNumberArg(args);
  const nameTokens = args.filter((a) => !Number.isFinite(Number(a)) && !String(a).startsWith("@"));
  const species = resolveSpecies(loadMora, nameTokens.join(" "));
  if (!species) return send(sock, chatId, "❌ Specify a Mora name.");
  if (cap === null || cap < 1) return send(sock, chatId, "❌ Cap must be ≥ 1.");

  const p = players[targetJid];
  shardSystem.ensureShardFields(p);
  p.shardStorage[shardSystem.shardKey(species)] = cap;
  savePlayers(players);
  return send(sock, chatId,
    `🏦 *STORAGE SET*\n@${targetJid.split("@")[0]}: *${species.name}* cap → *${cap}*`,
    [targetJid]);
}

async function cmdForceMerge(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, loadMora, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");

  let wantCorrupted = false;
  const nameTokens = args.filter((a) => {
    if (String(a).toLowerCase() === "corrupted") { wantCorrupted = true; return false; }
    return !String(a).startsWith("@") && !Number.isFinite(Number(a));
  });
  const species = resolveSpecies(loadMora, nameTokens.join(" "));
  if (!species) return send(sock, chatId, "❌ Specify a Mora name.");
  if (!shardSystem.isMergeable(species)) return send(sock, chatId, `❌ *${species.name}* isn't mergeable.`);

  const p = players[targetJid];
  shardSystem.ensureShardFields(p);
  shardSystem.clearMergeStatusEffects(p);
  p.currentMerge = shardSystem.buildMergeSnapshot(species, { corrupted: wantCorrupted });
  savePlayers(players);
  return send(sock, chatId,
    `🌀 *FORCED MERGE*\n@${targetJid.split("@")[0]} is now merged as *${species.name}*${wantCorrupted ? " ☠" : ""} (no shard consumed).`,
    [targetJid]);
}

async function cmdForceShed(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  shardSystem.ensureShardFields(p);
  const was = shardSystem.getCurrentMerge(p);
  shardSystem.clearMergeStatusEffects(p);
  p.currentMerge = null;
  savePlayers(players);
  return send(sock, chatId,
    `🍃 *FORCED SHED*\n@${targetJid.split("@")[0]} ${was ? `released the *${was.name}* form` : "was already base form"}.`,
    [targetJid]);
}

// ── player state ────────────────────────────────────────────────
async function cmdHp(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  if (String(args[args.length - 1] || "").toLowerCase() === "full") {
    p.playerHp = p.playerMaxHp || 100;
  } else {
    const v = getNumberArg(args);
    if (v === null) return send(sock, chatId, "❌ Usage: `.ow hp @u <hp|full>`");
    p.playerHp = Math.max(0, Math.min(v, p.playerMaxHp || Infinity));
  }
  savePlayers(players);
  return send(sock, chatId,
    `❤️ *HP SET*\n@${targetJid.split("@")[0]}: *${p.playerHp}/${p.playerMaxHp || 100}*`,
    [targetJid]);
}

async function cmdEnergy(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  if (typeof p.combatMaxEnergy !== "number") p.combatMaxEnergy = 50;
  const v = getNumberArg(args);
  if (v === null) return send(sock, chatId, "❌ Usage: `.ow energy @u <amt>`");
  p.combatEnergy = Math.min(v, p.combatMaxEnergy);
  savePlayers(players);
  return send(sock, chatId,
    `🔋 *ENERGY SET*\n@${targetJid.split("@")[0]}: *${p.combatEnergy}/${p.combatMaxEnergy}*`,
    [targetJid]);
}

async function cmdLevel(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  const lv = getNumberArg(args);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  if (lv === null || lv < 1) return send(sock, chatId, "❌ Usage: `.ow level @u <lv>`");
  const p = players[targetJid];
  const old = p.level || 1;
  p.level = Math.min(Math.round(lv), 100);
  p.xp = 0;
  savePlayers(players);
  return send(sock, chatId,
    `📊 *LEVEL SET*\n@${targetJid.split("@")[0]}: Lv *${old} → ${p.level}* (XP zeroed — stat points untouched)`,
    [targetJid]);
}

async function cmdFaction(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const want = String(args[args.length - 1] || "").toLowerCase();
  if (want === "none") {
    players[targetJid].faction = null;
  } else if (FACTIONS.includes(want)) {
    players[targetJid].faction = want;
  } else {
    return send(sock, chatId, `❌ Faction must be: harmony, purity, rift, or none.`);
  }
  savePlayers(players);
  return send(sock, chatId,
    `🏴 *FACTION SET*\n@${targetJid.split("@")[0]} → *${FACTION_LABEL[players[targetJid].faction] || "none"}*`,
    [targetJid]);
}

// Resolve the style object from a raw arg — accepts id, name, or a name fragment.
function resolveStyleArg(questSystem, raw) {
  if (!raw) return null;
  const q = String(raw).toLowerCase().trim();
  const styles = questSystem.loadStyles();
  return (
    styles[q] ||
    Object.values(styles).find((s) => s.id === q || s.name.toLowerCase() === q) ||
    Object.values(styles).find((s) => s.name.toLowerCase().includes(q)) ||
    null
  );
}

// Target defaults to the owner themselves when no @mention/reply/number is given.
function resolveOwnerTarget(args, helpers, msg, senderId) {
  return resolveTargetJid(args, helpers, msg) || senderId;
}

async function cmdStyle(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, questSystem } = ctx;
  const targetJid = resolveOwnerTarget(args, helpers, msg, senderId);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player (or run it as the owner without @).");
  const styleId = args.filter((a) => !String(a).startsWith("@"))[0];
  if (!styleId) return send(sock, chatId, "❌ Usage: `.ow style [@u] <styleId>` — grants the style (adds to moveset).");
  const p = players[targetJid];
  questSystem.ensureQuestFields(p);
  const st = resolveStyleArg(questSystem, styleId);
  if (!st) return send(sock, chatId, `❌ Style not found: *${styleId}*. Try *.ow styles-list* for the full catalog.`);
  if (!p.styles.includes(st.id)) p.styles.push(st.id);
  savePlayers(players);
  return send(sock, chatId,
    `🥋 *STYLE GRANTED*\n@${targetJid.split("@")[0]} learned *${st.name}* (${st.type})`,
    [targetJid]);
}

// .ow switch [@u] <styleId> — CLEARS everything and equips ONLY the chosen style.
// This is the "switch to any fighting style" Prime asked for (quick A/B testing).
async function cmdSwitchStyle(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, questSystem } = ctx;
  const targetJid = resolveOwnerTarget(args, helpers, msg, senderId);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player (or run it as the owner without @).");
  const styleId = args.filter((a) => !String(a).startsWith("@"))[0];
  if (!styleId) return send(sock, chatId, "❌ Usage: `.ow switch [@u] <styleId>` — replace with ONE style.");
  const p = players[targetJid];
  questSystem.ensureQuestFields(p);
  const st = resolveStyleArg(questSystem, styleId);
  if (!st) return send(sock, chatId, `❌ Style not found: *${styleId}*. Try *.ow styles-list* for the full catalog.`);
  const removed = (p.styles || []).filter((id) => id !== st.id).map((id) => questSystem.loadStyles()[id]?.name || id);
  p.styles = [st.id];
  p.equippedStyle = st.id; // switched style is now the one fighting
  savePlayers(players);
  return send(sock, chatId,
    `⚡ *STYLE SWITCHED*\n@${targetJid.split("@")[0]} → *${st.name}* (${st.type})\n` +
    (removed.length ? `_Removed ${removed.length}: ${removed.join(", ")}_\n` : ``) +
    `Moves now in *.attack*: ${(st.moves || []).map((m) => m.name).join(", ")}`,
    [targetJid]);
}

async function cmdShowStyles(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, questSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  questSystem.ensureQuestFields(p);
  const styles = questSystem.loadStyles();
  const owned = (p.styles || []).map((id) => styles[id]?.name || id);
  return send(sock, chatId,
    `🥋 *STYLES — @${targetJid.split("@")[0]}*\n${DIVIDER}\n` +
    (owned.length ? owned.map((n) => `• ${n}`).join("\n") : "_None._"),
    [targetJid]);
}

async function cmdListAllStyles(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, questSystem } = ctx;
  const styles = questSystem.loadStyles();
  const lines = Object.values(styles).map((s) => {
    const rarityIcon =
      s.rarity === "legendary" ? "🌟" :
      s.rarity === "epic" ? "💎" :
      s.rarity === "rare" ? "✨" : "🥋";
    return `${rarityIcon} *${s.name}*  _(${s.type} • ${s.rarity})_  → \`.ow switch ${s.id}\``;
  });
  return send(sock, chatId,
    `🥋 *STYLE CATALOG — ${Object.keys(styles).length} total*\n${DIVIDER}\n` +
    lines.join("\n") +
    `\n${DIVIDER}\n` +
    `_Switch with: .ow switch [@u] <styleId> — no @ switches YOUR style._`);
}

async function cmdClearStyles(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, questSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  questSystem.ensureQuestFields(p);
  const before = (p.styles || []).length;
  p.styles = [];
  savePlayers(players);
  return send(sock, chatId, `🧹 *STYLES CLEARED*\n@${targetJid.split("@")[0]}: removed ${before}.`, [targetJid]);
}

async function cmdCompleteQuest(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers, questSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const qId = args.filter((a) => !String(a).startsWith("@"))[0];
  if (!qId) return send(sock, chatId, "❌ Usage: `.ow quest @u <questId>`");
  const p = players[targetJid];
  questSystem.ensureQuestFields(p);
  const def = questSystem.loadQuests()[qId.toLowerCase()];
  if (!def) return send(sock, chatId, `❌ Quest not found: *${qId}*.`);
  const done = questSystem.applyCompletion(p, qId.toLowerCase());
  savePlayers(players);
  return send(sock, chatId,
    `📜 *QUEST FORCED*\n@${targetJid.split("@")[0]} completed *${def.name}* — rewards applied.`,
    [targetJid]);
}

async function cmdGiveItem(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const itemsSystem = require("./items");
  const p = players[targetJid];
  itemsSystem.ensurePlayerItemData(p);

  const qty = getNumberArg(args) || 1;
  const nameTokens = args.filter((a) => !String(a).startsWith("@") && !Number.isFinite(Number(a)));
  const item = itemsSystem.findItem(nameTokens.join(" "));
  if (!item) return send(sock, chatId, `❌ Item not found: *${nameTokens.join(" ")}*.`);

  const canAdd = itemsSystem.canAddItemToInventory(p, item.id, qty);
  if (!canAdd.ok) return send(sock, chatId, `❌ Cannot add: ${canAdd.reason}`);
  const added = itemsSystem.addItem(p, item.id, qty);
  if (!added.ok) return send(sock, chatId, `❌ ${added.reason}`);
  savePlayers(players);
  return send(sock, chatId,
    `🎁 *ITEM GRANT*\n@${targetJid.split("@")[0]} +${qty} × *${item.name}*`,
    [targetJid]);
}

async function cmdInspect(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, shardSystem } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const p = players[targetJid];
  shardSystem?.ensureShardFields?.(p);
  const safe = {
    name: p.name || p.username || "?",
    level: p.level || 1,
    xp: p.xp || 0,
    faction: p.faction || null,
    lucons: p.lucons || 0,
    reob: p.reob || 0,
    resonance: p.resonance || 0,
    intelligence: p.intelligence || 0,
    riftPE: p.riftPE || 0,
    statPoints: p.statPoints || 0,
    stats: p.stats || {},
    hp: `${p.playerHp || 0}/${p.playerMaxHp || 100}`,
    energy: `${p.combatEnergy || 0}/${p.combatMaxEnergy || 50}`,
    shards: p.shards || {},
    currentMerge: p.currentMerge?.name || null,
    styles: p.styles || [],
    starterShardChosen: !!p.starterShardChosen,
    starterStyleChosen: !!p.starterStyleChosen,
    createdAt: p.createdAt || null,
  };
  return send(sock, chatId, `🔍 *INSPECT — ${safe.name}*\n${DIVIDER}\n` + JSON.stringify(safe, null, 2).slice(0, 3000));
}

async function cmdResetPlayer(ctx, chatId, senderId, msg, args, helpers) {
  const { sock, players, savePlayers } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid || !players[targetJid]) return send(sock, chatId, "❌ Tag a registered player.");
  const confirm = args.some((a) => String(a).toLowerCase() === "confirm");
  if (!confirm) {
    return send(sock, chatId,
      `⚠️ *PLAYER RESET* — this erases *everything* for @${targetJid.split("@")[0]}.\n` +
      `Rerun with *confirm*: *.ow reset @${targetJid.split("@")[0]} confirm*`,
      [targetJid]);
  }
  const fresh = {
    jid: targetJid,
    name: players[targetJid].name || players[targetJid].username || "Fresh Start",
    lucons: 0,
    level: 1,
    xp: 0,
    stats: { melee: 1, mora: 1, vit: 1, speed: 1 },
    statPoints: 0,
    playerHp: 100,
    playerMaxHp: 100,
    combatEnergy: 50,
    combatMaxEnergy: 50,
    shards: {},
    shardStorage: {},
    currentMerge: null,
    styles: [],
    quests: { active: {}, completed: [] },
    faction: null,
    createdAt: players[targetJid].createdAt || new Date().toISOString(),
    ownerResetAt: new Date().toISOString(),
  };
  players[targetJid] = fresh;
  savePlayers(players);
  return send(sock, chatId,
    `🔄 *PLAYER RESET*\n@${targetJid.split("@")[0]} returned to a fresh start.`,
    [targetJid]);
}

// ── bans ────────────────────────────────────────────────────────
async function cmdBan(ctx, chatId, senderId, msg, args, helpers, doBan) {
  const { sock, players } = ctx;
  const targetJid = resolveTargetJid(args, helpers, msg);
  if (!targetJid) return send(sock, chatId, "❌ Tag a player.");

  const bans = loadBans();
  const key = normJidSafe(targetJid);

  if (!doBan) {
    delete bans[key];
    // also clear any digit-keyed entries
    const digits = key.replace(/\D/g, "");
    for (const k of Object.keys(bans)) {
      if (k.replace(/\D/g, "") === digits) delete bans[k];
    }
    saveBans(bans);
    return send(sock, chatId, `🚫 *UNBANNED*\n@${key.split("@")[0]} can use the bot again.`, [targetJid]);
  }

  const hours = getNumberArg(args);
  if (hours === null || hours <= 0) return send(sock, chatId, "❌ Usage: `.ow ban @u <hours> [reason]`");
  const reason = args
    .filter((a) => !String(a).startsWith("@") && !Number.isFinite(Number(a)))
    .join(" ")
    .trim() || "Banned by the Architect";

  bans[key] = { until: Date.now() + hours * 3600_000, reason };
  saveBans(bans);
  return send(sock, chatId,
    `⛔ *BANNED*\n@${key.split("@")[0]} — ${hours}h\n📝 ${reason}\n_Unban: .ow unban @${key.split("@")[0]}_`,
    [targetJid]);
}

// ── game control ────────────────────────────────────────────────
async function cmdSpawns(ctx, chatId, args) {
  const { sock } = ctx;
  const s = loadSettingsFile();
  s.features = s.features || {};
  const want = String(args[0] || "").toLowerCase();
  if (want === "on") s.features.groupSpawnsEnabled = true;
  else if (want === "off") s.features.groupSpawnsEnabled = false;
  else if (want !== "status") return send(sock, chatId, "❌ Usage: `.ow spawns on|off|status`");
  saveSettingsFile(s);
  return send(sock, chatId,
    `🫧 *SPAWNS*\nGroup spawns: *${s.features.groupSpawnsEnabled === false ? "OFF" : "ON"}*`);
}

async function cmdRaid(ctx, chatId, args) {
  const { sock } = ctx;
  const s = loadSettingsFile();
  s.autoRaid = s.autoRaid || {};
  const want = String(args[0] || "").toLowerCase();
  if (want === "on") s.autoRaid.enabled = true;
  else if (want === "off") s.autoRaid.enabled = false;
  else if (want !== "status") return send(sock, chatId, "❌ Usage: `.ow raid on|off|status|reset`");
  saveSettingsFile(s);
  return send(sock, chatId,
    `🌀 *AUTO-RAIDS*\nEnabled: *${s.autoRaid.enabled ? "ON" : "OFF"}*\n` +
    `Faction groups: ${["harmony", "purity", "rift"].map((f) => `${f}: ${s.factionGroups?.[f] ? "✅" : "⬜"}`).join("  ")}`);
}

async function cmdRaidReset(ctx, chatId) {
  const { sock } = ctx;
  const fresh = {
    phase: "idle",
    spawnedAt: 0,
    responseDeadline: 0,
    raidDeadline: 0,
    responder: null,
    victim: null,
    kaelHpMax: 0,
    kaelHp: 0,
    engagements: [],
    history: [],
  };
  saveJSON(RAID_STATE_FILE, fresh);
  // also open the spawn window
  const s = loadSettingsFile();
  s.autoRaid = s.autoRaid || {};
  s.autoRaid.lastResolvedAt = 0;
  saveSettingsFile(s);
  return send(sock, chatId, `🌀 *RAID STATE RESET*\nAuto-raid reset to idle — spawn window re-armed.`);
}

async function cmdFactionGroup(ctx, chatId, args) {
  const { sock } = ctx;
  const faction = String(args[0] || "").toLowerCase();
  if (!FACTIONS.includes(faction)) return send(sock, chatId, `❌ Faction must be: ${FACTIONS.join(", ")}`);
  const gid = String(args[1] || "");
  if (!gid) return send(sock, chatId, `❌ Usage: *.ow fgroup ${faction} <groupId@g.us>*`);
  const s = loadSettingsFile();
  s.factionGroups = s.factionGroups || {};
  s.factionGroups[faction] = gid;
  saveSettingsFile(s);
  return send(sock, chatId, `🏴 *FACTION GROUP SET*\n${FACTION_LABEL[faction]} → \`${gid}\``);
}

async function cmdTreasury(ctx, chatId, args) {
  const { sock } = ctx;
  const faction = String(args[0] || "").toLowerCase();
  const amt = getNumberArg(args);
  if (!FACTIONS.includes(faction) || amt === null) {
    return send(sock, chatId, "❌ Usage: `.ow treasury <harmony|purity|rift> <amt>`");
  }
  const t = loadJSON(TREASURY_FILE, {});
  if (!t[faction] || typeof t[faction] !== "object") t[faction] = { lucons: 0, mora: 0 };
  t[faction].lucons = Math.max(0, Number(t[faction].lucons || 0) + amt);
  saveJSON(TREASURY_FILE, t);
  return send(sock, chatId,
    `🏦 *TREASURY*\n${FACTION_LABEL[faction]}: *${t[faction].lucons}* Lucons ${amt >= 0 ? `(+${amt})` : `(${amt})`}`);
}

async function cmdFacPts(ctx, chatId, args) {
  const { sock } = ctx;
  const faction = String(args[0] || "").toLowerCase();
  const amt = getNumberArg(args);
  if (!FACTIONS.includes(faction) || amt === null) {
    return send(sock, chatId, "❌ Usage: `.ow facpts <harmony|purity|rift> <amt>`");
  }
  const fp = loadJSON(FACTION_POINTS_FILE, { harmony: 0, purity: 0, rift: 0 });
  fp[faction] = Math.max(0, Number(fp[faction] || 0) + amt);
  saveJSON(FACTION_POINTS_FILE, fp);
  return send(sock, chatId, `🏷 *FACTION POINTS*\n${FACTION_LABEL[faction]}: *${fp[faction]}*`);
}

async function cmdSettings(ctx, chatId, args) {
  const { sock } = ctx;
  const s = loadSettingsFile();
  const op = String(args[0] || "").toLowerCase();
  const key = String(args[1] || "");

  if (op === "get") {
    if (!key) return send(sock, chatId, "❌ Usage: `.ow settings get <key>`");
    const val = key.split(".").reduce((o, k) => (o == null ? o : o[k]), s);
    return send(sock, chatId, `⚙️ *SETTINGS*\n\`${key}\` = \`${JSON.stringify(val ?? null)}\``);
  }
  if (op === "set") {
    if (!key || !args[2]) return send(sock, chatId, "❌ Usage: `.ow settings set <key> <jsonValue>`\nExample: `.ow settings set autoRaid.enabled true`");
    let parsed;
    try { parsed = JSON.parse(args.slice(2).join(" ")); } catch {
      return send(sock, chatId, "❌ Value must be valid JSON (true, 42, \"text\", {...}).");
    }
    const parts = key.split(".");
    let node = s;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = parsed;
    saveSettingsFile(s);
    return send(sock, chatId, `⚙️ *SETTINGS SET*\n\`${key}\` → \`${JSON.stringify(parsed)}\``);
  }
  return send(sock, chatId, "❌ Usage: `.ow settings get <key>` | `.ow settings set <key> <json>`");
}

// ── eval sandbox ────────────────────────────────────────────────
async function cmdEval(ctx, chatId, senderId, code) {
  const { sock } = ctx;
  if (!code || !code.trim()) {
    return send(sock, chatId,
      `🔮 *.ow eval <js>* — run code with these in scope:\n` +
      `  ctx, sock, players, savePlayers, loadMora, args, senderId, chatId\n` +
      `Example: *.ow eval Object.keys(players).length*`);
  }
  try {
    const fn = new Function(
      "ctx", "sock", "players", "savePlayers", "loadMora", "args", "senderId", "chatId",
      `"use strict"; return eval(${JSON.stringify(code)});`
    );
    const out = await fn(ctx, sock, ctx.players, ctx.savePlayers, ctx.loadMora, [], senderId, chatId);
    let text;
    try { text = typeof out === "string" ? out : JSON.stringify(out, null, 2); }
    catch { text = String(out); }
    return send(sock, chatId, `🔮 *EVAL OK*\n${DIVIDER}\n${String(text).slice(0, 3000)}`);
  } catch (e) {
    return send(sock, chatId, `🔮 *EVAL ERROR*\n${DIVIDER}\n${String(e?.stack || e).slice(0, 1500)}`);
  }
}

module.exports = {
  cmdOwnerTools,
  isToolboxCommand,
  // exported for tests / other systems
  resolveTargetJid,
  resolveSpecies,
  loadSettingsFile,
  saveSettingsFile,
  loadBans,
  saveBans,
};
