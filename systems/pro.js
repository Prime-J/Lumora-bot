// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA PRO SUBSCRIPTION SYSTEM                                ║
// ║  Tiers: Ashen Mark (2w) / Crimson Mark (1m) / Obsidian (1y)    ║
// ║                                                                ║
// ║  Premium currency: Lucrystals (LCR)                            ║
// ║  Owner grants via .pro-grant (no payment integration — real    ║
// ║  USD is settled off-platform, then Architect runs the grant).  ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_DIR       = path.join(__dirname, "..", "data");
const AUTOCATCH_FILE = path.join(DATA_DIR, "autocatch_state.json");
const AUTOLOG_FILE   = path.join(DATA_DIR, "autocatch_log.json");

// ============================
// UI
// ============================
const DIV  = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SDIV = "──────────────────────";

function fmtMs(ms) {
  if (ms <= 0) return "expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ============================
// TIER DEFINITIONS
// ============================
// Each tier lists everything pro.js needs at runtime:
//   durationMs     — subscription length
//   priceUsd       — real-money price shown in .pro-info
//   crystalGrant   — LCR dropped on grant (one-time welcome)
//   dailyLucons    — bonus Lucons from .pro-daily
//   dailyLcrRange  — [min, max] LCR roll from .pro-daily
//   autocatchBudget— total auto-catches the tier ships with
//   refillPercent  — fraction of max hunt energy restored per refill (24h cd)
//   perks          — free-text perks printed by .pro-info
//
// Owner can override any number by editing the table below. Changes apply on
// next restart; existing subscribers keep whatever state is in players.json.
const TIERS = {
  ashen: {
    key: "ashen",
    label: "🜁 Ashen Mark",
    durationMs: 14 * 24 * 60 * 60 * 1000,      // 2 weeks
    priceUsd: 2,                                // $2
    crystalGrant: 100,
    dailyLucons: 250,
    dailyLcrRange: [2, 5],
    autocatchBudget: 50,
    refillPercent: 0.50,
    perks: [
      "Skips daily/weekly faction tax",
      "100 LCR welcome grant",
      "50 auto-catches (Eidolon Catcher)",
      "Hunt gauge refill every 24h (50% of max)",
      "Access to the Void Merchant (.summon-merchant)",
      "Can tame Premium mora",
    ],
  },
  crimson: {
    key: "crimson",
    label: "🜂 Crimson Mark",
    durationMs: 30 * 24 * 60 * 60 * 1000,      // 1 month
    priceUsd: 5,                                // $5
    crystalGrant: 250,
    dailyLucons: 500,
    dailyLcrRange: [5, 10],
    autocatchBudget: 150,
    refillPercent: 0.75,
    perks: [
      "Everything in Ashen",
      "250 LCR welcome grant",
      "150 auto-catches",
      "Hunt refill every 24h (75% of max)",
      "Doubled .pro-daily Lucons",
    ],
  },
  obsidian: {
    key: "obsidian",
    label: "🜄 Obsidian Mark",
    durationMs: 365 * 24 * 60 * 60 * 1000,     // 1 year
    priceUsd: 45,                               // $45
    crystalGrant: 3500,
    dailyLucons: 1500,
    dailyLcrRange: [15, 25],
    autocatchBudget: 2500,
    refillPercent: 1.00,
    perks: [
      "Everything in Crimson",
      "3500 LCR welcome grant",
      "2500 auto-catches",
      "Full hunt refill every 24h (100% of max)",
      "Triple .pro-daily Lucons",
      "VIP: priority arena queue (future)",
    ],
  },
};

const TIER_ALIASES = {
  ashen: "ashen",  a: "ashen", "2w": "ashen", biweekly: "ashen",
  crimson: "crimson", c: "crimson", monthly: "crimson", "1m": "crimson", month: "crimson",
  obsidian: "obsidian", o: "obsidian", yearly: "obsidian", "1y": "obsidian", year: "obsidian",
};

function resolveTier(key) {
  const k = String(key || "").toLowerCase().trim();
  return TIERS[TIER_ALIASES[k]] || null;
}

// ============================
// STATE: player-side fields (stored on the player object itself)
// ============================
// player.pro = {
//   tier: "ashen" | "crimson" | "obsidian",
//   grantedAt: ms,
//   expiresAt: ms,
//   crystals: number,
//   autocatchRemaining: number,
//   lastProDaily: ms,
//   lastHuntRefillAt: ms,
// }
function ensureProState(player) {
  if (!player || typeof player !== "object") return null;
  if (!player.pro || typeof player.pro !== "object") {
    player.pro = {
      tier: null,
      grantedAt: 0,
      expiresAt: 0,
      crystals: 0,
      autocatchRemaining: 0,
      lastProDaily: 0,
      lastHuntRefillAt: 0,
    };
  }
  const p = player.pro;
  if (typeof p.crystals !== "number") p.crystals = 0;
  if (typeof p.autocatchRemaining !== "number") p.autocatchRemaining = 0;
  if (typeof p.expiresAt !== "number") p.expiresAt = 0;
  if (typeof p.lastProDaily !== "number") p.lastProDaily = 0;
  if (typeof p.lastHuntRefillAt !== "number") p.lastHuntRefillAt = 0;
  return p;
}

function hasActivePro(player) {
  if (!player) return false;
  const p = ensureProState(player);
  if (!p || !p.tier) return false;
  return Number(p.expiresAt || 0) > Date.now();
}

function getActiveTier(player) {
  if (!hasActivePro(player)) return null;
  return resolveTier(player.pro.tier);
}

// ============================
// FILE IO — autocatch state & log
// ============================
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJson(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) { fs.writeFileSync(file, JSON.stringify(fallback, null, 2)); return fallback; }
  try { const raw = fs.readFileSync(file, "utf8"); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function writeJson(file, data) {
  ensureDir();
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

// autocatch_state.json shape:
// { [groupJid]: { [playerJid]: { remaining: N, armedAt: ms } } }
function loadAutocatchState() { return readJson(AUTOCATCH_FILE, {}); }
function saveAutocatchState(s) { writeJson(AUTOCATCH_FILE, s); }

// autocatch_log.json shape:
// { [playerJid]: [ { name, rarity, groupJid, at } ] } — most recent first
function loadAutocatchLog() { return readJson(AUTOLOG_FILE, {}); }
function saveAutocatchLog(s) { writeJson(AUTOLOG_FILE, s); }

function appendAutocatchLog(playerJid, entry) {
  const log = loadAutocatchLog();
  if (!Array.isArray(log[playerJid])) log[playerJid] = [];
  log[playerJid].unshift(entry);
  if (log[playerJid].length > 50) log[playerJid].length = 50;
  saveAutocatchLog(log);
}

// ============================
// COMMANDS
// ============================

// .pro-info — plans & USD pricing
async function cmdProInfo(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const lines = [];
  lines.push(DIV);
  lines.push(`💎 *LUMORA PRO — MARK SUBSCRIPTIONS*`);
  lines.push(DIV);
  lines.push(``);
  lines.push(`_Wear the Lumoran Mark. The Rifts respect it._`);
  lines.push(``);

  for (const t of Object.values(TIERS)) {
    lines.push(SDIV);
    lines.push(`${t.label}  —  *$${t.priceUsd} USD*`);
    lines.push(SDIV);
    lines.push(`⏳ Duration: ${fmtMs(t.durationMs)}`);
    lines.push(`💎 Welcome grant: *${t.crystalGrant} LCR* _(one-time on activation)_`);
    lines.push(`☀️ .pro-daily: +${t.dailyLucons} Lucons`);
    lines.push(`🪫 Hunt refill / 24h: ${Math.round(t.refillPercent * 100)}% of max`);
    lines.push(`🎯 Auto-catches: ${t.autocatchBudget}`);
    lines.push(`✨ Perks:`);
    for (const p of t.perks) lines.push(`   • ${p}`);
    lines.push(``);
  }

  lines.push(DIV);
  lines.push(`📩 *To subscribe:* DM the Architect.`);
  lines.push(`Payment is handled off-platform. After confirmation the`);
  lines.push(`Architect runs *.pro-grant @you <tier>* and the Mark`);
  lines.push(`lights up on your profile.`);
  lines.push(DIV);

  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

// .pro — status
async function cmdProStatus(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  const firstArg = String(args[0] || "").toLowerCase().trim();

  // .pro --hunt-energy  (refill)
  if (firstArg === "--hunt-energy" || firstArg === "-e" || firstArg === "refill") {
    if (!hasActivePro(player)) {
      return sock.sendMessage(chatId, { text: "❌ You need an active Mark to refill the hunt gauge. See *.pro-info*." }, { quoted: msg });
    }
    const tier = getActiveTier(player);
    const pro  = ensureProState(player);
    const now  = Date.now();

    const cd = 24 * 60 * 60 * 1000;
    const timeLeft = (pro.lastHuntRefillAt + cd) - now;
    if (timeLeft > 0) {
      return sock.sendMessage(chatId, { text: `⏳ Next refill available in *${fmtMs(timeLeft)}*.` }, { quoted: msg });
    }

    const maxE = Number(player.maxHuntEnergy || 200);
    player.maxHuntEnergy = maxE;
    if (typeof player.huntEnergy !== "number") player.huntEnergy = 0;
    const before = player.huntEnergy;
    const gain = Math.floor(maxE * tier.refillPercent);
    player.huntEnergy = Math.min(maxE, player.huntEnergy + gain);
    pro.lastHuntRefillAt = now;

    // Sync to hunt state if present
    try {
      const huntingSystem = require("./hunting");
      const st = huntingSystem.loadHuntState?.();
      if (st) {
        const h = huntingSystem.ensureHunter?.(st, senderId);
        if (h) {
          h.huntEnergy    = player.huntEnergy;
          h.huntEnergyMax = player.maxHuntEnergy;
          huntingSystem.saveHuntState?.(st);
        }
      }
    } catch {}

    savePlayers(players);

    return sock.sendMessage(chatId, {
      text:
        `${DIV}\n` +
        `🔋 *HUNT GAUGE REFILLED*\n` +
        `${DIV}\n\n` +
        `${tier.label} restores *${gain}* energy (${Math.round(tier.refillPercent * 100)}% of max).\n` +
        `⚡ Energy: *${before} → ${player.huntEnergy}/${maxE}*\n` +
        `⏳ Next refill in 24h.`,
    }, { quoted: msg });
  }

  // .pro — plain status
  const pro = ensureProState(player);
  if (!hasActivePro(player)) {
    return sock.sendMessage(chatId, {
      text:
        `${DIV}\n` +
        `💎 *PRO STATUS*\n` +
        `${DIV}\n\n` +
        `⛔ You do not have an active Lumoran Mark.\n` +
        `💠 Lucrystals: *${pro.crystals} LCR*\n\n` +
        `Use *.pro-info* to see subscription plans.`,
    }, { quoted: msg });
  }

  const tier = getActiveTier(player);
  const left = pro.expiresAt - Date.now();

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `💎 *PRO STATUS*\n` +
      `${DIV}\n\n` +
      `🏷  Tier: *${tier.label}*\n` +
      `⏳ Expires in: *${fmtMs(left)}*\n` +
      `💠 Lucrystals: *${pro.crystals} LCR*\n` +
      `🎯 Auto-catches left: *${pro.autocatchRemaining}*\n` +
      `🔋 Hunt refill: every 24h (${Math.round(tier.refillPercent * 100)}% of max)\n\n` +
      `Use *.pro --hunt-energy* to refill.\n` +
      `Use *.pro-daily* to claim today's bounty.\n` +
      `Use *.pro-market* to browse the Lucrystal shop.`,
  }, { quoted: msg });
}

// .pro-daily — daily pro claim
async function cmdProDaily(ctx, chatId, senderId, msg) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }
  if (!hasActivePro(player)) {
    return sock.sendMessage(chatId, { text: "❌ No active Mark. See *.pro-info* for tiers." }, { quoted: msg });
  }

  const pro  = ensureProState(player);
  const tier = getActiveTier(player);
  const now  = Date.now();
  const cd   = 24 * 60 * 60 * 1000;
  const elapsed = now - Number(pro.lastProDaily || 0);
  if (elapsed < cd) {
    return sock.sendMessage(chatId, { text: `⏳ Your pro tribute is recharging. Next claim in *${fmtMs(cd - elapsed)}*.` }, { quoted: msg });
  }

  const lucons = tier.dailyLucons;
  player.lucons = Number(player.lucons || 0) + lucons;
  pro.lastProDaily = now;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `☀️ *PRO DAILY CLAIMED*\n` +
      `${DIV}\n\n` +
      `${tier.label}\n\n` +
      `💰 +${lucons} Lucons\n\n` +
      `🏦 Lucons: *${player.lucons}*\n` +
      `💎 LCR: *${pro.crystals}*\n` +
      `⏳ Next claim in 24h.\n\n` +
      `_Lucrystals are granted only on subscription activation. Spend them in *.pro-market*._`,
  }, { quoted: msg });
}

// .exchange <lucons>  →  1000 Lucons = 1 LCR
async function cmdExchange(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  const amt = Number(args[0]);
  if (!Number.isFinite(amt) || amt <= 0 || amt % 1000 !== 0) {
    return sock.sendMessage(chatId, { text: "Usage: *.exchange <lucons>*\nAmount must be a positive multiple of 1000.\nRate: *1000 Lucons = 1 Lucrystal*" }, { quoted: msg });
  }

  const bal = Number(player.lucons || 0);
  if (bal < amt) {
    return sock.sendMessage(chatId, { text: `❌ Not enough Lucons. You have *${bal}*, need *${amt}*.` }, { quoted: msg });
  }

  const lcr = Math.floor(amt / 1000);
  const pro = ensureProState(player);
  player.lucons = bal - amt;
  pro.crystals  = Number(pro.crystals || 0) + lcr;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `🔁 *EXCHANGE COMPLETE*\n` +
      `${DIV}\n\n` +
      `💰 −${amt} Lucons\n` +
      `💠 +${lcr} Lucrystals\n\n` +
      `🏦 Lucons: *${player.lucons}*\n` +
      `💎 LCR: *${pro.crystals}*`,
  }, { quoted: msg });
}

// ============================
// OWNER: .pro-grant / .crystals
// ============================
async function cmdProGrant(ctx, chatId, senderId, msg, args = [], helpers = {}) {
  const { sock, players, savePlayers, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Architect-only command." }, { quoted: msg });
  }

  const { getMentionedJids = () => [], getRepliedJid = () => null, toUserJidFromArg = () => null, normJid = (x) => x } = helpers;
  const target = normJid(getMentionedJids(msg)[0] || getRepliedJid(msg) || toUserJidFromArg(args[0]) || "");
  if (!target || !players[target]) {
    return sock.sendMessage(chatId, { text: "Usage: *.pro-grant @user <ashen|crimson|obsidian>*" }, { quoted: msg });
  }

  // Tier arg is last non-mention token
  const tierArg = (args[args.length - 1] || "").toLowerCase().trim();
  const tier = resolveTier(tierArg);
  if (!tier) {
    return sock.sendMessage(chatId, { text: "❌ Unknown tier. Choose: *ashen*, *crimson*, *obsidian*." }, { quoted: msg });
  }

  const player = players[target];
  const pro = ensureProState(player);
  const now = Date.now();

  // Stack duration if they already have a tier, otherwise start fresh.
  const currentExpires = Math.max(pro.expiresAt || 0, now);
  pro.tier       = tier.key;
  pro.grantedAt  = now;
  pro.expiresAt  = currentExpires + tier.durationMs;
  pro.crystals   = Number(pro.crystals || 0) + tier.crystalGrant;
  pro.autocatchRemaining = Number(pro.autocatchRemaining || 0) + tier.autocatchBudget;
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `👑 *MARK BESTOWED*\n` +
      `${DIV}\n\n` +
      `@${target.split("@")[0]} now bears the *${tier.label}*.\n\n` +
      `⏳ Expires: ${fmtMs(pro.expiresAt - now)}\n` +
      `💠 +${tier.crystalGrant} LCR granted\n` +
      `🎯 +${tier.autocatchBudget} auto-catches added`,
    mentions: [target],
  }, { quoted: msg });
}

async function cmdGrantCrystals(ctx, chatId, senderId, msg, args = [], helpers = {}) {
  const { sock, players, savePlayers, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Architect-only command." }, { quoted: msg });
  }
  const { getMentionedJids = () => [], getRepliedJid = () => null, toUserJidFromArg = () => null, normJid = (x) => x } = helpers;
  const target = normJid(getMentionedJids(msg)[0] || getRepliedJid(msg) || toUserJidFromArg(args[0]) || "");
  if (!target || !players[target]) {
    return sock.sendMessage(chatId, { text: "Usage: *.crystals @user <amount>*" }, { quoted: msg });
  }
  const amt = Number(args[args.length - 1]);
  if (!Number.isFinite(amt) || amt === 0) {
    return sock.sendMessage(chatId, { text: "❌ Amount must be a non-zero number (negative = remove)." }, { quoted: msg });
  }
  const player = players[target];
  const pro = ensureProState(player);
  pro.crystals = Math.max(0, Number(pro.crystals || 0) + amt);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `💎 Lucrystals adjusted for @${target.split("@")[0]}\n` +
      `Change: *${amt > 0 ? "+" : ""}${amt} LCR*\n` +
      `New balance: *${pro.crystals} LCR*`,
    mentions: [target],
  }, { quoted: msg });
}

// ============================
// PRO MARKET — Lucrystal shop
// ============================
// Items are applied immediately on purchase (no inventory slot needed for
// most of them — they're buffs/consumables/charges). Each item's `apply`
// function mutates the player and returns a short success line.
const PRO_ITEMS = {
  eidolon_catcher: {
    id: "eidolon_catcher",
    name: "Eidolon Catcher",
    price: 40,
    desc: "Bundle of 20 extra auto-catch charges. Works in any group you arm.",
    apply: (player) => {
      const pro = ensureProState(player);
      pro.autocatchRemaining = Number(pro.autocatchRemaining || 0) + 20;
      return `+20 auto-catches (total: ${pro.autocatchRemaining})`;
    },
  },
  ashen_refill_vial: {
    id: "ashen_refill_vial",
    name: "Ashen Refill Vial",
    price: 15,
    desc: "Single-use: instantly refills the hunt gauge to max.",
    apply: (player) => {
      const maxE = Number(player.maxHuntEnergy || 200);
      player.maxHuntEnergy = maxE;
      player.huntEnergy = maxE;
      return `Hunt gauge refilled to ${maxE}/${maxE}`;
    },
  },
  moraward_totem: {
    id: "moraward_totem",
    name: "Moraward Totem",
    price: 60,
    desc: "Doubles your catch success for the next 10 spawns in any group.",
    apply: (player) => {
      const pro = ensureProState(player);
      pro.moraward = { charges: 10 };
      return `Moraward active — next 10 catches empowered`;
    },
  },
  luccers_charter: {
    id: "luccers_charter",
    name: "Luccer's Charter",
    price: 120,
    desc: "+50% daily Lucons (from .daily and .pro-daily) for 7 days.",
    apply: (player) => {
      const pro = ensureProState(player);
      pro.charter = { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
      return `Charter active for 7 days (+50% daily Lucons)`;
    },
  },
  ashveil_thread: {
    id: "ashveil_thread",
    name: "Ashveil Thread",
    price: 25,
    desc: "Repair all equipped gear's Lumen (HP) back to full.",
    apply: (player) => {
      const itemsSystem = require("./items");
      itemsSystem.ensurePlayerItemData(player);
      const itemsDb = itemsSystem.loadItems();
      const slots = ["core", "charm", "tool", "relic", "cloak", "boots", "badge"];
      let repaired = 0;
      for (const slot of slots) {
        const id = player.equipment[slot];
        if (!id) continue;
        const item = itemsDb[id];
        if (!item) continue;
        const max = item.durability ?? itemsSystem.BASE_DURABILITY_BY_RARITY?.[item.rarity] ?? 3;
        player.equipment[`${slot}Durability`] = max;
        repaired++;
      }
      return repaired > 0 ? `Restored Lumen on ${repaired} equipped gear item(s)` : `No gear equipped.`;
    },
  },
};

async function cmdProMarket(ctx, chatId, senderId, msg) {
  const { sock, players } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }
  const pro = ensureProState(player);

  const lines = [];
  lines.push(DIV);
  lines.push(`💎 *LUCRYSTAL MARKET*`);
  lines.push(DIV);
  lines.push(`💠 Balance: *${pro.crystals} LCR*`);
  lines.push(``);
  for (const it of Object.values(PRO_ITEMS)) {
    lines.push(SDIV);
    lines.push(`*${it.name}* — ${it.price} LCR`);
    lines.push(`🆔 \`${it.id}\``);
    lines.push(`📜 ${it.desc}`);
  }
  lines.push(SDIV);
  lines.push(``);
  lines.push(`Buy with *.pbuy <id>*  (e.g. \`.pbuy eidolon_catcher\`)`);
  lines.push(`Convert Lucons with *.exchange 1000*`);

  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

async function cmdProBuy(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }

  const query = String(args[0] || "").toLowerCase().trim().replace(/\s+/g, "_");
  if (!query) {
    return sock.sendMessage(chatId, { text: "Usage: *.pbuy <item id>* — browse with *.pro-market*" }, { quoted: msg });
  }

  // Accept both id and loose name match
  let item = PRO_ITEMS[query];
  if (!item) {
    const needle = query.replace(/_/g, "");
    item = Object.values(PRO_ITEMS).find(i =>
      i.id.replace(/_/g, "") === needle ||
      i.name.toLowerCase().replace(/\s+/g, "") === needle
    );
  }
  if (!item) {
    return sock.sendMessage(chatId, { text: `❌ Pro item not found: *${query}*` }, { quoted: msg });
  }

  const pro = ensureProState(player);
  if (Number(pro.crystals || 0) < item.price) {
    return sock.sendMessage(chatId, {
      text: `❌ Not enough Lucrystals. Need *${item.price}*, have *${pro.crystals}*.`,
    }, { quoted: msg });
  }

  pro.crystals -= item.price;
  const resultLine = item.apply(player);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `💎 *LUCRYSTAL PURCHASE*\n` +
      `${DIV}\n\n` +
      `🛒 *${item.name}* — ${item.price} LCR\n` +
      `✨ ${resultLine}\n\n` +
      `💠 Remaining: *${pro.crystals} LCR*`,
  }, { quoted: msg });
}

// ============================
// AUTOCATCH — module-level state (persistence via autocatch_state.json)
// ============================
// Each spawn, index.js/spawn.js will call `tryAutocatch(ctx, chatId, spawnInfo)`.
// We roll a balanced fail chance; on success we credit the player and decrement
// their quota. Failures DO NOT consume quota (per user requirement).
//
// Per spawn we only ever arm ONE player in the group (whoever has quota).
// If multiple are armed, we rotate by earliest armedAt.
const AUTOCATCH_SUCCESS_RATE = 0.60;   // 60% per attempt — "balanced"
const AUTOCATCH_RETRY_DELAY_MS = 10 * 1000;

async function cmdAutocatch(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using `.start`." }, { quoted: msg });
  }
  if (!hasActivePro(player)) {
    return sock.sendMessage(chatId, { text: "❌ Auto-catch is a Mark perk. See *.pro-info*." }, { quoted: msg });
  }
  if (!chatId.endsWith("@g.us")) {
    return sock.sendMessage(chatId, { text: "❌ Auto-catch must be armed inside the group where you want it to run." }, { quoted: msg });
  }

  const pro = ensureProState(player);
  const sub = String(args[0] || "").toLowerCase().trim();

  const state = loadAutocatchState();
  if (!state[chatId]) state[chatId] = {};

  // .autocatch off
  if (sub === "off" || sub === "disable" || sub === "stop") {
    if (state[chatId][senderId]) {
      delete state[chatId][senderId];
      saveAutocatchState(state);
      return sock.sendMessage(chatId, { text: "🛑 Auto-catch disarmed in this group." }, { quoted: msg });
    }
    return sock.sendMessage(chatId, { text: "ℹ️ You have no active auto-catch in this group." }, { quoted: msg });
  }

  // .autocatch            → status
  // .autocatch <N>        → arm for N captures
  const n = Number(sub);
  if (!sub || !Number.isFinite(n) || n <= 0) {
    const armed = state[chatId][senderId];
    const lines = [
      `${DIV}`,
      `🎯 *AUTO-CATCH STATUS*`,
      `${DIV}`,
      ``,
      `Quota remaining: *${pro.autocatchRemaining}*`,
      armed
        ? `Armed in this group: *${armed.remaining}* catches left`
        : `Not armed in this group.`,
      ``,
      `Arm with: *.autocatch <count>*`,
      `Disarm with: *.autocatch off*`,
      `View log: *.autocatch-log*`,
    ];
    return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
  }

  const wanted = Math.floor(n);
  if (wanted > pro.autocatchRemaining) {
    return sock.sendMessage(chatId, {
      text: `❌ Not enough quota. You asked for *${wanted}* but only have *${pro.autocatchRemaining}* left.\nBuy more with *.pbuy eidolon_catcher*.`,
    }, { quoted: msg });
  }

  // Reserve from pro pool, move into the group-arm bucket.
  pro.autocatchRemaining -= wanted;
  state[chatId][senderId] = {
    remaining: wanted,
    armedAt: Date.now(),
  };
  saveAutocatchState(state);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `🎯 *AUTO-CATCH ARMED*\n` +
      `${DIV}\n\n` +
      `The *Eidolon Catcher* is now watching this group.\n` +
      `Budget: *${wanted}* catches.\n` +
      `Success rate: *${Math.round(AUTOCATCH_SUCCESS_RATE * 100)}%* per attempt — failures don't consume quota.\n\n` +
      `Disarm with *.autocatch off*.\n` +
      `Your remaining pool: *${pro.autocatchRemaining}*.`,
  }, { quoted: msg });
}

async function cmdAutocatchLog(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  const log = loadAutocatchLog();
  const entries = Array.isArray(log[senderId]) ? log[senderId] : [];
  if (!entries.length) {
    return sock.sendMessage(chatId, { text: "📭 No auto-caught mora yet." }, { quoted: msg });
  }
  const lines = [`${DIV}`, `🎯 *AUTO-CATCH LOG* _(last ${Math.min(entries.length, 20)})_`, `${DIV}`, ``];
  for (const e of entries.slice(0, 20)) {
    const ago = fmtMs(Date.now() - Number(e.at || 0));
    lines.push(`• *${e.name}* (${e.rarity}) — ${ago} ago`);
  }
  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

// Called by spawn.js right after a mora is posted. Returns true if the spawn
// is being handled by auto-catch (so the normal flow should step back).
async function tryAutocatchOnSpawn(ctx, chatId, spawnInfo) {
  try {
    if (!chatId || !String(chatId).endsWith("@g.us")) return false;
    const state = loadAutocatchState();
    const group = state[chatId];
    if (!group || Object.keys(group).length === 0) return false;

    // Pick the player with earliest armedAt who still has remaining.
    const candidates = Object.entries(group)
      .filter(([, v]) => Number(v.remaining || 0) > 0)
      .sort((a, b) => Number(a[1].armedAt || 0) - Number(b[1].armedAt || 0));
    if (!candidates.length) return false;

    const [catcherJid, armState] = candidates[0];
    const { players, savePlayers, loadMora } = ctx;
    const player = players[catcherJid];
    if (!player || !hasActivePro(player)) {
      // Subscription expired — drop the arm
      delete group[catcherJid];
      saveAutocatchState(state);
      return false;
    }

    // Kick off async resolution (don't block the spawn handler).
    runAutocatchAttempt(ctx, chatId, catcherJid, spawnInfo, 0).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

async function runAutocatchAttempt(ctx, chatId, catcherJid, spawnInfo, retryCount) {
  const { sock, players, savePlayers, loadMora } = ctx;
  const MAX_RETRIES = 1; // single retry after 10s per spec

  // Balanced roll: 60% success, 40% fail.
  const success = Math.random() < AUTOCATCH_SUCCESS_RATE;

  if (!success) {
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => {
        runAutocatchAttempt(ctx, chatId, catcherJid, spawnInfo, retryCount + 1).catch(() => {});
      }, AUTOCATCH_RETRY_DELAY_MS);
      return;
    }
    // Final failure — quota NOT decremented (user requirement).
    try {
      await sock.sendMessage(chatId, {
        text: `🌀 The *Eidolon Catcher* slipped — the mora vanished.\n(Quota preserved.)`,
      });
    } catch {}
    return;
  }

  // Success path — check spawn is still active, then perform the catch.
  let spawnSys;
  try { spawnSys = require("./spawn"); } catch { return; }
  const state = spawnSys.loadState ? spawnSys.loadState() : null;
  if (!state) return;
  const gs = state[chatId];
  if (!gs || !gs.active || Number(gs.active.moraId) !== Number(spawnInfo.moraId)) {
    return; // spawn already resolved by someone else
  }

  const moraList = typeof loadMora === "function" ? loadMora() : [];
  const species = moraList.find(m => Number(m.id) === Number(gs.active.moraId));
  if (!species) return;

  const catcher = players[catcherJid];
  if (!catcher) return;

  // Build owned mora via ctx helper (same path as .catch).
  let owned;
  if (typeof ctx.createOwnedMoraFromSpecies === "function") {
    owned = ctx.createOwnedMoraFromSpecies(species);
  } else {
    owned = {
      moraId: Number(species.id),
      name: species.name,
      type: species.type,
      rarity: species.rarity,
      level: 1, xp: 0,
      hp: Number(species?.baseStats?.hp || 50),
      maxHp: Number(species?.baseStats?.hp || 50),
      moves: [],
      stats: {
        atk: Number(species?.baseStats?.atk || 10),
        def: Number(species?.baseStats?.def || 10),
        spd: Number(species?.baseStats?.spd || 10),
        energy: Number(species?.baseStats?.energy || 30),
      },
      energy: Number(species?.baseStats?.energy || 30),
      maxEnergy: Number(species?.baseStats?.energy || 30),
    };
  }

  if (!Array.isArray(catcher.moraOwned)) catcher.moraOwned = [];
  catcher.moraOwned.push(owned);

  // Clear the spawn
  state[chatId].active = null;
  if (spawnSys.saveState) spawnSys.saveState(state);

  // Decrement group arm quota
  const ac = loadAutocatchState();
  if (ac[chatId] && ac[chatId][catcherJid]) {
    ac[chatId][catcherJid].remaining = Math.max(0, Number(ac[chatId][catcherJid].remaining || 0) - 1);
    if (ac[chatId][catcherJid].remaining <= 0) delete ac[chatId][catcherJid];
    saveAutocatchState(ac);
  }

  // Log
  appendAutocatchLog(catcherJid, {
    name: species.name,
    rarity: species.rarity,
    groupJid: chatId,
    at: Date.now(),
  });

  savePlayers(players);

  // Announce
  try {
    await sock.sendMessage(chatId, {
      text:
        `🎯 *EIDOLON CATCHER*\n\n` +
        `The ancient catcher bound *${species.name}* to @${catcherJid.split("@")[0]} while they were away.\n` +
        `_(Check .autocatch-log to view.)_`,
      mentions: [catcherJid],
    });
  } catch {}
}

// ============================
// EXPORTS
// ============================
module.exports = {
  // tier + state
  TIERS,
  resolveTier,
  ensureProState,
  hasActivePro,
  getActiveTier,

  // player commands
  cmdProInfo,
  cmdProStatus,
  cmdProDaily,
  cmdExchange,
  cmdProMarket,
  cmdProBuy,

  // owner commands
  cmdProGrant,
  cmdGrantCrystals,

  // autocatch
  cmdAutocatch,
  cmdAutocatchLog,
  tryAutocatchOnSpawn,
  loadAutocatchState,
  saveAutocatchState,
  appendAutocatchLog,

  // pro market items
  PRO_ITEMS,
};
