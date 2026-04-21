// ============================
// STAR TOOLS — Prime-only powers Star can wield via Anthropic tool use.
// Every tool checks isPrime at call time. Non-Prime callers get a polite refusal.
// ============================

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

function normJid(j = "") { return String(j).split(":")[0].split("/")[0]; }
function digits(j = "") { return normJid(j).replace(/\D/g, ""); }

// --------------------------------------
// TOOL DEFINITIONS (Anthropic tool-use schema)
// --------------------------------------
const TOOL_DEFS = [
  {
    name: "list_players",
    description: "List Lumora players. Filter by faction, level range, or search by username/name. Returns up to 25 results sorted by relevance. Use when Prime asks 'who is X', 'list rift players', 'top players', 'who's level 30+', etc.",
    input_schema: {
      type: "object",
      properties: {
        faction: { type: "string", enum: ["harmony", "purity", "rift", "any"], description: "filter by faction (default any)" },
        min_level: { type: "number", description: "minimum level filter" },
        max_level: { type: "number", description: "maximum level filter" },
        search: { type: "string", description: "fuzzy match on username (case-insensitive substring)" },
        sort: { type: "string", enum: ["level", "lucons", "aura", "recent"], description: "sort key, default level desc" },
        limit: { type: "number", description: "max results, capped at 25" },
      },
    },
  },
  {
    name: "get_player_info",
    description: "Get detailed stats for ONE player by username, jid, or digits. Use when Prime says 'tell me about Stan', 'show Lily's stats', etc.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "username, jid, or phone digits" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "list_groups",
    description: "List all groups the bot is in. Useful when Prime asks 'what groups am I in', 'list hunting groups', etc.",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "optional substring filter on group name" },
      },
    },
  },
  {
    name: "faction_status",
    description: "Get current faction-war points and member counts. Use when Prime asks 'who's winning', 'faction standings', etc.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "treasury_status",
    description: "Get faction treasuries (lucons, wall HP, honour, deployed mora count). Use when Prime asks about wall, treasury, honour.",
    input_schema: {
      type: "object",
      properties: {
        faction: { type: "string", enum: ["harmony", "purity", "rift", "all"], description: "default all" },
      },
    },
  },
  {
    name: "give_lucons",
    description: "Give Lucons to a player. PRIME ONLY. Use when Prime says 'give X 500 lucons', 'pay Y'. Negative amounts deduct.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "username, jid, or digits of recipient" },
        amount: { type: "number", description: "amount to give (negative to deduct)" },
        reason: { type: "string", description: "optional reason for log" },
      },
      required: ["identifier", "amount"],
    },
  },
  {
    name: "warn_player",
    description: "Send a warning DM/group message to a player from Star. Use when Prime says 'warn X', 'tell Y to stop'. Includes 'from Prime' framing.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "username, jid, or digits" },
        reason: { type: "string", description: "what they're being warned about" },
      },
      required: ["identifier", "reason"],
    },
  },
  {
    name: "tag_player",
    description: "Tag/ping a player in the current chat with a message from Star. Use when Prime says 'tag X' or 'call Y over'.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "username, jid, or digits" },
        message: { type: "string", description: "what to say when tagging" },
      },
      required: ["identifier", "message"],
    },
  },
  {
    name: "bot_stats",
    description: "Get overall bot stats: total players, faction breakdown, active in last 24h, total Lucons in economy. Use when Prime asks 'how's the bot doing', 'stats'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "force_spawn",
    description: "Force a wild Mora to spawn in the CURRENT group right now (bypasses cooldown and roll). PRIME ONLY. Groups only. Use when Prime says 'spawn one', 'drop a mora', 'force spawn'.",
    input_schema: { type: "object", properties: {} },
  },
];

// --------------------------------------
// PLAYER LOOKUP HELPERS
// --------------------------------------
function findPlayer(ctx, identifier) {
  if (!identifier) return null;
  const players = ctx.players || {};
  const id = String(identifier).trim();
  const wantDigits = id.replace(/\D/g, "");

  // direct jid hit
  if (players[id]) return { jid: id, player: players[id] };
  if (players[normJid(id)]) return { jid: normJid(id), player: players[normJid(id)] };

  // by digits
  if (wantDigits) {
    for (const k of Object.keys(players)) {
      if (digits(k) === wantDigits) return { jid: k, player: players[k] };
    }
  }

  // by username (case-insensitive exact, then substring)
  const lower = id.toLowerCase();
  let exact = null, partial = null;
  for (const [k, p] of Object.entries(players)) {
    const u = (p.username || "").toLowerCase();
    if (u === lower) { exact = { jid: k, player: p }; break; }
    if (!partial && u && u.includes(lower)) partial = { jid: k, player: p };
  }
  return exact || partial;
}

// --------------------------------------
// TOOL EXECUTORS
// --------------------------------------
async function execListPlayers(ctx, input) {
  const players = ctx.players || {};
  let arr = Object.entries(players).map(([jid, p]) => ({ jid, ...p }));

  if (input.faction && input.faction !== "any") arr = arr.filter(p => p.faction === input.faction);
  if (Number.isFinite(input.min_level)) arr = arr.filter(p => (p.level || 1) >= input.min_level);
  if (Number.isFinite(input.max_level)) arr = arr.filter(p => (p.level || 1) <= input.max_level);
  if (input.search) {
    const s = input.search.toLowerCase();
    arr = arr.filter(p => (p.username || "").toLowerCase().includes(s));
  }

  const sortKey = input.sort || "level";
  arr.sort((a, b) => {
    if (sortKey === "lucons") return (b.lucons || 0) - (a.lucons || 0);
    if (sortKey === "aura") return (b.aura || 0) - (a.aura || 0);
    if (sortKey === "recent") return (b.lastSeen || 0) - (a.lastSeen || 0);
    return (b.level || 1) - (a.level || 1);
  });

  const limit = Math.min(Math.max(parseInt(input.limit, 10) || 15, 1), 25);
  const total = arr.length;
  const slice = arr.slice(0, limit).map(p => ({
    username: p.username || "(unset)",
    jid: p.jid,
    digits: digits(p.jid),
    level: p.level || 1,
    aura: p.aura || 0,
    lucons: p.lucons || 0,
    faction: p.faction || "none",
    pvp_wins: p.battlesWon || 0,
  }));
  return { total_matched: total, returned: slice.length, players: slice };
}

async function execGetPlayer(ctx, input) {
  const hit = findPlayer(ctx, input.identifier);
  if (!hit) return { found: false, message: `No player matching "${input.identifier}"` };
  const p = hit.player;
  return {
    found: true,
    jid: hit.jid,
    digits: digits(hit.jid),
    username: p.username || "(unset)",
    level: p.level || 1,
    xp: p.xp || 0,
    aura: p.aura || 0,
    intelligence: p.intelligence || 0,
    lucons: p.lucons || 0,
    lucrystals: p.lucrystals || 0,
    faction: p.faction || "none",
    mora_owned: (p.moraOwned || []).length,
    battles_won: p.battlesWon || 0,
    total_hunts: p.totalHunts || 0,
    login_streak: p.loginStreak || 0,
    resonance: p.resonance || 0,
    companion_bond: p.companionBond || 0,
    hunt_energy: p.huntEnergy || 0,
    is_pro: !!(p.pro && (p.pro.tier || p.pro.until)),
    last_seen: p.lastSeen ? new Date(p.lastSeen).toISOString() : null,
  };
}

async function execListGroups(ctx, input) {
  const sock = ctx.sock;
  if (!sock?.groupFetchAllParticipating) return { error: "groupFetchAllParticipating unavailable" };
  let groups;
  try { groups = await sock.groupFetchAllParticipating(); }
  catch (e) { return { error: e.message }; }
  let arr = Object.values(groups || {}).map(g => ({
    id: g.id,
    name: g.subject || "(unnamed)",
    size: (g.participants || []).length,
  }));
  if (input.filter) {
    const f = input.filter.toLowerCase();
    arr = arr.filter(g => g.name.toLowerCase().includes(f));
  }
  arr.sort((a, b) => b.size - a.size);
  return { total: arr.length, groups: arr.slice(0, 30) };
}

async function execFactionStatus(ctx) {
  const fp = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "faction_points.json"), "utf8")); }
    catch { return null; }
  })();
  const players = ctx.players || {};
  const counts = { harmony: 0, purity: 0, rift: 0, none: 0 };
  for (const p of Object.values(players)) {
    const f = p.faction || "none";
    if (counts[f] !== undefined) counts[f]++;
  }
  return {
    points: fp || {},
    member_counts: counts,
  };
}

async function execTreasuryStatus(ctx, input) {
  if (!ctx.loadTreasury) return { error: "treasury system unavailable" };
  const t = ctx.loadTreasury();
  const which = input.faction && input.faction !== "all" ? [input.faction] : ["harmony", "purity", "rift"];
  const out = {};
  for (const f of which) {
    const fac = t[f]; if (!fac) continue;
    out[f] = {
      lucons: fac.lucons || 0,
      mora_deployed: (fac.moraDeployed || []).length,
      wall_hp: fac.wallHp || 0,
      wall_max_hp: fac.wallMaxHp || 0,
      wall_level: fac.wallLevel || 1,
      honour: fac.honour || 0,
      crystal_count: (fac.wallMaterials || []).length,
    };
  }
  return out;
}

async function execGiveLucons(ctx, input, isPrime) {
  if (!isPrime) return { error: "PRIME_ONLY", message: "Only Prime can give lucons." };
  const hit = findPlayer(ctx, input.identifier);
  if (!hit) return { ok: false, error: `No player matching "${input.identifier}"` };
  const amt = parseInt(input.amount, 10);
  if (!Number.isFinite(amt) || amt === 0) return { ok: false, error: "amount must be non-zero number" };
  const before = hit.player.lucons || 0;
  hit.player.lucons = Math.max(0, before + amt);
  if (ctx.savePlayers) ctx.savePlayers(ctx.players);
  return {
    ok: true,
    username: hit.player.username || "(unset)",
    digits: digits(hit.jid),
    before, after: hit.player.lucons, delta: amt,
    reason: input.reason || null,
  };
}

async function execWarnPlayer(ctx, input, isPrime, chatId) {
  if (!isPrime) return { error: "PRIME_ONLY" };
  const hit = findPlayer(ctx, input.identifier);
  if (!hit) return { ok: false, error: `No player matching "${input.identifier}"` };
  const text = `⚠️ *Heads up from Prime, hun.* @${digits(hit.jid)}\n\n${input.reason}\n\n_— Star_`;
  try {
    await ctx.sock.sendMessage(chatId, { text, mentions: [hit.jid] });
    return { ok: true, warned: hit.player.username || digits(hit.jid) };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function execTagPlayer(ctx, input, isPrime, chatId) {
  if (!isPrime) return { error: "PRIME_ONLY" };
  const hit = findPlayer(ctx, input.identifier);
  if (!hit) return { ok: false, error: `No player matching "${input.identifier}"` };
  const text = `@${digits(hit.jid)} ${input.message}`;
  try {
    await ctx.sock.sendMessage(chatId, { text, mentions: [hit.jid] });
    return { ok: true, tagged: hit.player.username || digits(hit.jid) };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function execForceSpawn(ctx, isPrime, chatId) {
  if (!isPrime) return { error: "PRIME_ONLY" };
  if (!chatId || !chatId.endsWith("@g.us")) return { ok: false, error: "must be in a group" };
  try {
    const spawnSystem = require("./spawn");
    if (typeof spawnSystem.forceSpawn !== "function") return { ok: false, error: "forceSpawn unavailable" };
    return await spawnSystem.forceSpawn(ctx, chatId);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function execBotStats(ctx) {
  const players = ctx.players || {};
  const arr = Object.values(players);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const totalLucons = arr.reduce((a, p) => a + (p.lucons || 0), 0);
  const factions = { harmony: 0, purity: 0, rift: 0, none: 0 };
  let active24h = 0, proCount = 0;
  for (const p of arr) {
    const f = p.faction || "none";
    if (factions[f] !== undefined) factions[f]++;
    if (p.lastSeen && now - p.lastSeen < day) active24h++;
    if (p.pro && (p.pro.tier || p.pro.until)) proCount++;
  }
  return {
    total_players: arr.length,
    active_last_24h: active24h,
    pro_subscribers: proCount,
    factions,
    total_lucons_in_economy: totalLucons,
  };
}

// --------------------------------------
// DISPATCHER
// --------------------------------------
async function runTool(toolName, toolInput, { ctx, isPrime, chatId }) {
  try {
    switch (toolName) {
      case "list_players":     return await execListPlayers(ctx, toolInput || {});
      case "get_player_info":  return await execGetPlayer(ctx, toolInput || {});
      case "list_groups":      return await execListGroups(ctx, toolInput || {});
      case "faction_status":   return await execFactionStatus(ctx);
      case "treasury_status":  return await execTreasuryStatus(ctx, toolInput || {});
      case "give_lucons":      return await execGiveLucons(ctx, toolInput || {}, isPrime);
      case "warn_player":      return await execWarnPlayer(ctx, toolInput || {}, isPrime, chatId);
      case "tag_player":       return await execTagPlayer(ctx, toolInput || {}, isPrime, chatId);
      case "bot_stats":        return await execBotStats(ctx);
      case "force_spawn":      return await execForceSpawn(ctx, isPrime, chatId);
      default: return { error: `unknown tool: ${toolName}` };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

module.exports = { TOOL_DEFS, runTool };
