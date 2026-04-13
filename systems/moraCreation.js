// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA LABS — MORA CREATION SYSTEM                            ║
// ║                                                                ║
// ║  Players with 15+ Intelligence can forge a new Mora species    ║
// ║  at Lumora Labs using a Creation Powder. Submissions are       ║
// ║  queued for the Architect to approve via .creations /          ║
// ║  .approve-mora / .reject-mora.                                 ║
// ║                                                                ║
// ║  Shape of data/mora_submissions.json:                          ║
// ║    {                                                           ║
// ║      nextId: 1,                                                ║
// ║      pending: { [id]: { ...submission... } }                   ║
// ║    }                                                           ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_DIR  = path.join(__dirname, "..", "data");
const SUB_FILE  = path.join(DATA_DIR, "mora_submissions.json");
const MORA_FILE = path.join(DATA_DIR, "mora.json");

const itemsSystem = require("./items");

// ============================
// CONFIG
// ============================
const MIN_INTELLIGENCE = 15;        // Required to wield Creation Powder
const POWDER_ID        = "CREATION_POWDER";

// Faction → allowed Mora types. Keep this aligned with FACTIONS.styles in
// index.js so Harmony creators can't forge Shadow void beasts, etc.
const FACTION_TYPES = {
  harmony: ["Nature", "Aqua", "Wind", "Terra"],
  purity:  ["Terra", "Frost", "Volt", "Psychic"],
  rift:    ["Shadow", "Volt", "Flame", "Frost", "Void"],
  neutral: ["Nature", "Aqua", "Wind", "Terra", "Frost", "Volt", "Shadow", "Flame"],
};

// ============================
// UI
// ============================
const DIV  = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SDIV = "──────────────────────";

// ============================
// FILE IO
// ============================
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadSubmissions() {
  ensureDir();
  if (!fs.existsSync(SUB_FILE)) {
    const init = { nextId: 1, pending: {} };
    fs.writeFileSync(SUB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const raw = fs.readFileSync(SUB_FILE, "utf8");
    const parsed = raw ? JSON.parse(raw) : { nextId: 1, pending: {} };
    if (typeof parsed.nextId !== "number") parsed.nextId = 1;
    if (!parsed.pending || typeof parsed.pending !== "object") parsed.pending = {};
    return parsed;
  } catch {
    return { nextId: 1, pending: {} };
  }
}
function saveSubmissions(s) {
  ensureDir();
  fs.writeFileSync(SUB_FILE, JSON.stringify(s, null, 2));
}
function loadMoraFile() {
  try {
    const raw = fs.readFileSync(MORA_FILE, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveMoraFile(arr) {
  fs.writeFileSync(MORA_FILE, JSON.stringify(arr, null, 2));
}

// ============================
// STAT ROLLING
// ============================
// Base stats scale with creator intelligence + tame skill so a 15-int
// player gets a starter-tier Mora while a 30+ int veteran can forge
// something much stronger. Hard-capped so nothing can out-roll a
// Mythical premium mora.
function rollBaseStats(player) {
  const intel = Number(player.intelligence || 0);
  const tame  = Number(player.tameSkill   || 0);
  const power = Math.min(250, 40 + intel * 2 + tame);

  const rand = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
  return {
    hp:     rand(Math.floor(power * 0.9),  Math.floor(power * 1.3)),
    atk:    rand(Math.floor(power * 0.7),  Math.floor(power * 1.1)),
    def:    rand(Math.floor(power * 0.6),  Math.floor(power * 1.0)),
    spd:    rand(Math.floor(power * 0.6),  Math.floor(power * 1.0)),
    energy: rand(Math.floor(power * 0.4),  Math.floor(power * 0.7)),
  };
}

// Rarity is derived from the player's investment, not chosen freely.
function rollRarity(player) {
  const intel = Number(player.intelligence || 0);
  if (intel >= 60) return "legendary";
  if (intel >= 40) return "epic";
  if (intel >= 25) return "rare";
  if (intel >= 18) return "uncommon";
  return "common";
}

// ============================
// INPUT PARSING
// ============================
// Expected usage:
// .create-mora <name> | <type> | <description> | <move1> | <move2> | <move3> | <move4> | <special>
// Each move: name~power~accuracy    (accuracy optional, defaults to 90)
// Special appears as a single learn-on-level move at level 18.
function parseMove(raw, fallbackPower) {
  if (!raw) return null;
  const [rawName, rawPower, rawAcc] = String(raw).split("~").map(s => s.trim());
  const name = (rawName || "").slice(0, 32);
  if (!name) return null;
  const power = Math.max(10, Math.min(150, Number(rawPower) || fallbackPower));
  const accuracy = Math.max(50, Math.min(100, Number(rawAcc) || 90));
  return {
    name,
    power,
    accuracy,
    category: power >= 70 ? "Special" : "Physical",
    desc: "A move forged at Lumora Labs.",
  };
}

function parseSubmission(rawArgs) {
  const joined = rawArgs.join(" ").trim();
  if (!joined) return { ok: false, reason: "empty" };
  const parts = joined.split("|").map(s => s.trim());
  if (parts.length < 8) {
    return { ok: false, reason: "fields" };
  }

  const [
    name,
    type,
    desc,
    m1, m2, m3, m4,
    special,
  ] = parts;

  if (!name || name.length < 3 || name.length > 24) {
    return { ok: false, reason: "name" };
  }

  const moves = [
    parseMove(m1, 40),
    parseMove(m2, 50),
    parseMove(m3, 60),
    parseMove(m4, 70),
  ];
  if (moves.some(m => !m)) return { ok: false, reason: "moves" };

  const specialMove = parseMove(special, 85);
  if (!specialMove) return { ok: false, reason: "special" };

  return {
    ok: true,
    draft: {
      name,
      type: titleCase(type),
      description: desc.slice(0, 240),
      starterMoves: moves,
      specialMove,
    },
  };
}

function titleCase(str) {
  return String(str || "").trim().replace(/\b\w/g, c => c.toUpperCase());
}

// ============================
// COMMANDS
// ============================

// .create-mora — submit a new design
async function cmdCreateMora(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers } = ctx;
  const player = players[senderId];
  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using *.start*." }, { quoted: msg });
  }

  // Intelligence gate
  const intel = Number(player.intelligence || 0);
  if (intel < MIN_INTELLIGENCE) {
    return sock.sendMessage(chatId, {
      text:
        `${DIV}\n` +
        `🔒 *LUMORA LABS — LOCKED*\n` +
        `${DIV}\n\n` +
        `The labs only open to minds attuned enough to shape primordial matter.\n\n` +
        `🧠 Intelligence: *${intel} / ${MIN_INTELLIGENCE}*\n\n` +
        `_Train your Intelligence before attempting creation._`,
    }, { quoted: msg });
  }

  // Creation Powder gate
  itemsSystem.ensurePlayerItemData(player);
  const powderQty = itemsSystem.getItemQuantity(player, POWDER_ID);
  if (powderQty <= 0) {
    return sock.sendMessage(chatId, {
      text:
        `${DIV}\n` +
        `💨 *NO CREATION POWDER*\n` +
        `${DIV}\n\n` +
        `You need *1 Creation Powder* to forge a new Mora.\n` +
        `_Drops rarely from high-tier hunts. Pro subscribers receive more on activation._`,
    }, { quoted: msg });
  }

  // Usage check — no args
  if (!args.length) {
    return sock.sendMessage(chatId, {
      text:
        `${DIV}\n` +
        `🧪 *LUMORA LABS — CREATE A MORA*\n` +
        `${DIV}\n\n` +
        `Submit all fields in ONE message, separated by *|*.\n\n` +
        `*Format:*\n` +
        `.create-mora <name> | <type> | <description> | <move1> | <move2> | <move3> | <move4> | <special>\n\n` +
        `*Each move:*  \`Name~Power~Accuracy\`\n` +
        `   • Power: 10–150\n` +
        `   • Accuracy: 50–100 (optional, default 90)\n\n` +
        `*Example:*\n` +
        `.create-mora Sylviane | Nature | A moss-cloaked guardian of forgotten groves. | Thorn Jab~40~95 | Bramble Guard~0~100 | Verdant Lash~60~90 | Moss Veil~0~100 | Bloomstrike~95~85\n\n` +
        `🧠 Intelligence req: *${MIN_INTELLIGENCE}*  (you have *${intel}*)\n` +
        `💨 Creation Powder: *${powderQty}*\n\n` +
        `⚠️ Submissions go to the Architect for approval. Powder is consumed on submission — *rejected designs do not refund*.`,
    }, { quoted: msg });
  }

  const parsed = parseSubmission(args);
  if (!parsed.ok) {
    const reasonMsg = {
      empty:   "You must fill out every field.",
      fields:  "Missing fields. Expected 8 segments separated by *|*.",
      name:    "Name must be 3–24 characters.",
      moves:   "One of the 4 starter moves is malformed. Use `Name~Power~Accuracy`.",
      special: "Special move is malformed. Use `Name~Power~Accuracy`.",
    }[parsed.reason] || "Invalid submission.";
    return sock.sendMessage(chatId, { text: `❌ ${reasonMsg}\n\nRun *.create-mora* with no args to see the format.` }, { quoted: msg });
  }

  // Faction type rule
  const faction = player.faction || "neutral";
  const allowedTypes = FACTION_TYPES[faction] || FACTION_TYPES.neutral;
  if (!allowedTypes.includes(parsed.draft.type)) {
    return sock.sendMessage(chatId, {
      text:
        `❌ *Type Rejected*\n\n` +
        `Your faction (*${faction}*) cannot forge Mora of type *${parsed.draft.type}*.\n\n` +
        `Allowed: ${allowedTypes.map(t => `*${t}*`).join(", ")}`,
    }, { quoted: msg });
  }

  // Uniqueness check vs mora.json
  const existing = loadMoraFile();
  const nameLower = parsed.draft.name.toLowerCase();
  if (existing.some(m => String(m.name || "").toLowerCase() === nameLower)) {
    return sock.sendMessage(chatId, { text: `❌ A Mora named *${parsed.draft.name}* already exists in the registry.` }, { quoted: msg });
  }

  // Consume powder (no refund on reject — that's the price of attempt)
  const removed = itemsSystem.removeItem(player, POWDER_ID, 1);
  if (!removed.ok) {
    return sock.sendMessage(chatId, { text: `❌ Failed to consume Creation Powder.` }, { quoted: msg });
  }

  // Build the full submission payload
  const subs = loadSubmissions();
  const id = subs.nextId++;
  const rarity    = rollRarity(player);
  const baseStats = rollBaseStats(player);

  const moves = {};
  const learnset = { "1": [] };
  for (const mv of parsed.draft.starterMoves) {
    moves[mv.name] = { power: mv.power, accuracy: mv.accuracy, category: mv.category, desc: mv.desc };
    learnset["1"].push(mv.name);
  }
  const sp = parsed.draft.specialMove;
  moves[sp.name] = { power: sp.power, accuracy: sp.accuracy, category: "Special", desc: "A signature move, learned through bond." };
  learnset["18"] = [sp.name];

  subs.pending[String(id)] = {
    id,
    creatorJid: senderId,
    creatorName: (player.username && String(player.username).trim()) || senderId.split("@")[0],
    creatorFaction: faction,
    submittedAt: new Date().toISOString(),
    draft: {
      name: parsed.draft.name,
      type: parsed.draft.type,
      rarity,
      description: parsed.draft.description || "A Mora forged at Lumora Labs.",
      baseStats,
      moves,
      learnset,
    },
  };
  saveSubmissions(subs);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `🧪 *SUBMISSION RECEIVED*\n` +
      `${DIV}\n\n` +
      `📝 Submission #${id}\n` +
      `🐲 *${parsed.draft.name}* — ${parsed.draft.type} (${rarity})\n` +
      `🧬 Stats: HP ${baseStats.hp} · ATK ${baseStats.atk} · DEF ${baseStats.def} · SPD ${baseStats.spd} · ENG ${baseStats.energy}\n\n` +
      `💨 *1 Creation Powder consumed.*\n\n` +
      `Your design now rests with the Architect for approval.\n` +
      `_You will be tagged when the verdict arrives._`,
    mentions: [senderId],
  }, { quoted: msg });
}

// .creations — owner: list pending submissions
async function cmdCreationsList(ctx, chatId, senderId, msg) {
  const { sock, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Architect-only command." }, { quoted: msg });
  }

  const subs = loadSubmissions();
  const ids = Object.keys(subs.pending || {});
  if (!ids.length) {
    return sock.sendMessage(chatId, { text: "📭 No pending Mora submissions." }, { quoted: msg });
  }

  const lines = [];
  lines.push(DIV);
  lines.push(`🧪 *LUMORA LABS — PENDING CREATIONS*`);
  lines.push(DIV);
  lines.push(``);
  for (const id of ids) {
    const s = subs.pending[id];
    const d = s.draft;
    const when = (s.submittedAt || "").split("T")[0] || "—";
    lines.push(SDIV);
    lines.push(`#${s.id} — *${d.name}*  (${d.type}, ${d.rarity})`);
    lines.push(`👤 By: *${s.creatorName}* · 📅 ${when}`);
    lines.push(`📜 ${d.description}`);
    lines.push(`🧬 HP ${d.baseStats.hp} · ATK ${d.baseStats.atk} · DEF ${d.baseStats.def} · SPD ${d.baseStats.spd}`);
    lines.push(`🎯 Moves: ${Object.keys(d.moves).join(", ")}`);
  }
  lines.push(SDIV);
  lines.push(``);
  lines.push(`✅ *.approve-mora <id> <amount> <lucons|lcr>*`);
  lines.push(`❌ *.reject-mora <id>*`);

  return sock.sendMessage(chatId, { text: lines.join("\n") }, { quoted: msg });
}

// .approve-mora <id> <amount> <lucons|lcr>
async function cmdApproveMora(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Architect-only command." }, { quoted: msg });
  }

  const id = String(args[0] || "").trim();
  const amount = Number(args[1]);
  const currency = String(args[2] || "lucons").toLowerCase();

  if (!id || !Number.isFinite(amount) || amount <= 0 || !["lucons", "lcr"].includes(currency)) {
    return sock.sendMessage(chatId, {
      text: "Usage: *.approve-mora <id> <amount> <lucons|lcr>*\nExample: `.approve-mora 3 500 lucons`",
    }, { quoted: msg });
  }

  const subs = loadSubmissions();
  const s = subs.pending[id];
  if (!s) {
    return sock.sendMessage(chatId, { text: `❌ Submission #${id} not found.` }, { quoted: msg });
  }

  const creator = players[s.creatorJid];
  if (!creator) {
    return sock.sendMessage(chatId, { text: `❌ Creator no longer registered. Submission dropped.` }, { quoted: msg });
  }

  // Append to mora.json with a fresh numeric id
  const moraList = loadMoraFile();
  const maxId = moraList.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0);
  const newMora = {
    id: maxId + 1,
    name: s.draft.name,
    type: s.draft.type,
    rarity: s.draft.rarity,
    description: s.draft.description,
    baseStats: s.draft.baseStats,
    moves: s.draft.moves,
    learnset: s.draft.learnset,
    createdBy: s.creatorJid,
    createdByName: s.creatorName,
  };
  moraList.push(newMora);
  saveMoraFile(moraList);

  // Pay the creator
  let payLine = "";
  if (currency === "lcr") {
    const proSystem = require("./pro");
    const pro = proSystem.ensureProState(creator);
    pro.crystals = Number(pro.crystals || 0) + amount;
    payLine = `💠 *+${amount} Lucrystals* awarded.`;
  } else {
    creator.lucons = Number(creator.lucons || 0) + amount;
    payLine = `💰 *+${amount} Lucons* awarded.`;
  }

  // Remove from pending
  delete subs.pending[id];
  saveSubmissions(subs);
  savePlayers(players);

  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `✨ *CREATION APPROVED*\n` +
      `${DIV}\n\n` +
      `@${s.creatorJid.split("@")[0]}, your design *${newMora.name}* has been accepted into the Lumora registry!\n\n` +
      `🐲 Mora #${newMora.id} — ${newMora.type} (${newMora.rarity})\n` +
      `${payLine}\n\n` +
      `_It may now be encountered and tamed by others._`,
    mentions: [s.creatorJid],
  }, { quoted: msg });
}

// .reject-mora <id>
async function cmdRejectMora(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, isOwner } = ctx;
  if (!isOwner) {
    return sock.sendMessage(chatId, { text: "❌ Architect-only command." }, { quoted: msg });
  }

  const id = String(args[0] || "").trim();
  if (!id) {
    return sock.sendMessage(chatId, { text: "Usage: *.reject-mora <id>*" }, { quoted: msg });
  }

  const subs = loadSubmissions();
  const s = subs.pending[id];
  if (!s) {
    return sock.sendMessage(chatId, { text: `❌ Submission #${id} not found.` }, { quoted: msg });
  }

  delete subs.pending[id];
  saveSubmissions(subs);

  const mentions = players[s.creatorJid] ? [s.creatorJid] : [];
  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `❌ *CREATION REJECTED*\n` +
      `${DIV}\n\n` +
      `@${s.creatorJid.split("@")[0]}, your submission *${s.draft.name}* was rejected by the Architect.\n\n` +
      `_The Creation Powder was consumed on submission and is not refunded._`,
    mentions,
  }, { quoted: msg });
}

module.exports = {
  cmdCreateMora,
  cmdCreationsList,
  cmdApproveMora,
  cmdRejectMora,
};
