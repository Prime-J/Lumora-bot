// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA LABS — MORA CREATION SYSTEM (STAGED FLOW)             ║
// ║                                                                ║
// ║  Players with 25+ Intelligence can forge a new Mora species    ║
// ║  at Lumora Labs using a Reob (Rift Seeker origin). Submissions ║
// ║  are queued for the Architect to approve via .creations /      ║
// ║  .approve-mora / .reject-mora.                                 ║
// ║                                                                ║
// ║  Creation is now staged: players proceed through a multi-step  ║
// ║  conversation where they provide name, type, description,     ║
// ║  and moves one at a time.                                     ║
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
const MIN_INTELLIGENCE = 25;        // Required to wield Reobs (from Rift Seekers)
const ORB_ID           = "REOB";

// Valid Mora types (no faction restriction, but we hint at faction affinity in messages)
const VALID_TYPES = ["Nature", "Aqua", "Wind", "Terra", "Frost", "Volt", "Shadow", "Flame", "Void", "Psychic"];

// Rarity roll weights by intelligence bracket (25+ only)
const RARITY_TABLES = {
  // intel 25-34
  "25-34": { common: 0.30, uncommon: 0.35, rare: 0.25, epic: 0.10, legendary: 0 },
  // intel 35-49
  "35-49": { common: 0.15, uncommon: 0.30, rare: 0.35, epic: 0.15, legendary: 0.05 },
  // intel 50+
  "50+":   { common: 0.05, uncommon: 0.15, rare: 0.30, epic: 0.35, legendary: 0.15 },
};

// ============================
// UI
// ============================
const DIV  = "━━━━━━━━━━━━━━━━━━━━━━━━━";
const SDIV = "──────────────────────";

// ============================
// PENDING CREATIONS STATE MACHINE
// ============================
const pendingCreations = new Map();
// Format: {
//   stage: 'name_type' | 'description' | 'moves' | 'special',
//   chatId: string,
//   createdAt: timestamp,
//   draft: { name?, type?, desc?, moves?: [], special?: {...} }
// }

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

// Rarity roll with weighted tables per intelligence bracket (25+)
function rollRarity(player) {
  const intel = Number(player.intelligence || 0);
  let table;
  if (intel >= 50) table = RARITY_TABLES["50+"];
  else if (intel >= 35) table = RARITY_TABLES["35-49"];
  else table = RARITY_TABLES["25-34"];

  const roll = Math.random();
  let cumulative = 0;
  for (const [rarity, weight] of Object.entries(table)) {
    cumulative += weight;
    if (roll <= cumulative) return rarity;
  }
  return "common"; // fallback
}

// ============================
// MOVE PARSING
// ============================
function parseMove(raw, fallbackPower) {
  if (!raw) return null;
  const [rawName, rawPower, rawAcc, rawCategory] = String(raw).split("~").map(s => s.trim());
  const name = (rawName || "").slice(0, 32);
  if (!name) return null;
  const power = Math.max(0, Math.min(150, Number(rawPower) || fallbackPower));
  const accuracy = Math.max(50, Math.min(100, Number(rawAcc) || 90));
  const category = (rawCategory || "").toLowerCase();

  let resolvedCategory = "Physical";
  if (category === "special" || category === "psychic") resolvedCategory = "Special";
  else if (category === "status" || power === 0) resolvedCategory = "Status";
  else if (category === "physical") resolvedCategory = "Physical";

  return {
    name,
    power,
    accuracy,
    category: resolvedCategory,
    desc: "A move forged at Lumora Labs.",
  };
}

function titleCase(str) {
  return String(str || "").trim().replace(/\b\w/g, c => c.toUpperCase());
}

// ============================
// COMMANDS
// ============================

// Check if mora creation is allowed in this chat
// Owners bypass group restrictions
function isMoraCreationAllowed(chatId, settings, isOwner = false) {
  if (isOwner) return true; // Owners can create in any group
  const moraGroups = settings?.moraCreationGroups;
  if (!moraGroups?.enabled) return false;
  if (!moraGroups.allowed || moraGroups.allowed.length === 0) return true; // empty = all groups
  return moraGroups.allowed.includes(chatId);
}

// .create-mora — initiate the flow
async function cmdCreateMora(ctx, chatId, senderId, msg, args = []) {
  const { sock, players, savePlayers, settings, isOwner } = ctx;
  const player = players[senderId];

  if (!player) {
    return sock.sendMessage(chatId, { text: "❌ Register first using *.start*." }, { quoted: msg });
  }

  // Check if creation is allowed in this group (owners bypass restrictions)
  if (!isMoraCreationAllowed(chatId, settings, isOwner)) {
    return sock.sendMessage(chatId, {
      text: `❌ *Mora creation is not available in this group.*\nCheck with the Architect or visit an allowed Lumora Labs location.`,
    }, { quoted: msg });
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

  // Reob gate (skip for owner)
  if (!isOwner) {
    itemsSystem.ensurePlayerItemData(player);
    const orbQty = itemsSystem.getItemQuantity(player, ORB_ID);
    if (orbQty <= 0) {
      return sock.sendMessage(chatId, {
        text:
          `${DIV}\n` +
          `💫 *REOB DEPLETED*\n` +
          `${DIV}\n\n` +
          `You need *1 Reob* to forge a new Mora.\n\n` +
          `Reobs are spheres of pure rift energy, harvested by Rift Seekers. They grant you the power to create.\n\n` +
          `_Contact the Architect for Reobs, or earn them through the Pro system._`,
      }, { quoted: msg });
    }
  }

  // Set player into pending creation flow
  pendingCreations.set(senderId, {
    stage: "name_type",
    chatId,
    createdAt: Date.now(),
    draft: {}
  });

  // Send immersive intro
  return sock.sendMessage(chatId, {
    text:
      `${DIV}\n` +
      `⚗️  *LUMORA LABS — CREATION ARRAY ACTIVE*\n` +
      `${DIV}\n\n` +
      `_A Rift Seeker approaches, bearing a Reob that hums with infinite potential..._\n\n` +
      `Your consciousness interfaces with the Creation Array. The Reob pulses—*ready to birth something new*.\n\n` +
      `*What is the name and element of your creation?*\n\n` +
      `Format: Name | Type\n\n` +
      `Example: Sylviane | Nature\n\n` +
      `Valid types: ${VALID_TYPES.map(t => '*' + t + '*').join(", ")}\n\n` +
      `_Or type *.cancel-create* to abandon this vision._`,
    mentions: [senderId],
  });
}

// .cancel-create — abort the flow
async function cmdCancelCreate(ctx, chatId, senderId, msg) {
  const { sock } = ctx;
  if (!pendingCreations.has(senderId)) {
    return sock.sendMessage(chatId, { text: "❌ You don't have an active creation in progress." }, { quoted: msg });
  }
  pendingCreations.delete(senderId);
  return sock.sendMessage(chatId, {
    text: `✨ *Creation abandoned.*\nThe Array fades... your vision dissolves back into the Rift.`,
  }, { quoted: msg });
}

// Handle pending creation messages
async function handlePendingCreation(ctx, chatId, senderId, msg, text) {
  const { sock, players, savePlayers, settings, isOwner } = ctx;
  const pending = pendingCreations.get(senderId);

  if (!pending) return; // safety check

  const now = Date.now();
  if (now - pending.createdAt > 15 * 60 * 1000) {
    // 15 min timeout
    pendingCreations.delete(senderId);
    return sock.sendMessage(chatId, { text: "⏳ *Creation session expired.* The Array went dormant. Start over with *.create-mora*." }, { quoted: msg });
  }

  if (pending.stage === "name_type") {
    const parts = text.split("|").map(s => s.trim());
    if (parts.length < 2) {
      return sock.sendMessage(chatId, { text: `❌ Expected format: \`Name | Type\`\n\nTry again:` }, { quoted: msg });
    }
    const [name, type] = parts;
    if (!name || name.length < 3 || name.length > 24) {
      return sock.sendMessage(chatId, { text: "❌ Name must be 3–24 characters." }, { quoted: msg });
    }
    const typeLower = titleCase(type);
    if (!VALID_TYPES.includes(typeLower)) {
      return sock.sendMessage(chatId, { text: `❌ Type must be one of: ${VALID_TYPES.map(t => '*' + t + '*').join(", ")}` }, { quoted: msg });
    }
    pending.draft.name = name;
    pending.draft.type = typeLower;
    pending.stage = "description";
    return sock.sendMessage(chatId, {
      text:
        `✨ *${name}* the *${typeLower}* Mora...\n\n` +
        `The Array hums deeper. It needs to understand your creation's form and spirit.\n\n` +
        `*Describe your Mora.* Its appearance, its nature, what makes it unique:\n\n` +
        `_(Max 240 characters)_\n\n` +
        `_Or *.cancel-create* to abandon._`,
      mentions: [senderId],
    });
  }

  if (pending.stage === "description") {
    const desc = text.slice(0, 240);
    pending.draft.desc = desc;
    pending.stage = "moves";
    return sock.sendMessage(chatId, {
      text:
        `💎 *The Array integrates your vision.*\n\n` +
        `Now, channel your intent into the Mora's combat form. You must inscribe *4 starter techniques*.\n\n` +
        `*Format (separated by |):*\n\`MoveName~Power~Accuracy~Category | MoveName~Power~Accuracy~Category | ...\`\n\n` +
        `*Power:* 0–150 (0 = status move, no damage)\n*Accuracy:* 50–100 (default 90)\n*Category:* physical, special, or status\n\n` +
        `Example:\n\`Thorn Jab~40~95~physical | Bramble Guard~0~100~status | Verdant Lash~60~90~special | Moss Veil~0~100~status\`\n\n` +
        `_Or *.cancel-create* to abandon._`,
      mentions: [senderId],
    });
  }

  if (pending.stage === "moves") {
    const moveParts = text.split("|").map(s => s.trim());
    if (moveParts.length !== 4) {
      return sock.sendMessage(chatId, { text: `❌ Expected 4 moves separated by |. You provided ${moveParts.length}.` }, { quoted: msg });
    }
    const moves = [];
    for (const mp of moveParts) {
      const m = parseMove(mp, 50);
      if (!m) {
        return sock.sendMessage(chatId, { text: `❌ Malformed move: \`${mp}\`\n\nFormat: \`Name~Power~Accuracy~Category\`` }, { quoted: msg });
      }
      moves.push(m);
    }
    pending.draft.moves = moves;
    pending.stage = "special";
    return sock.sendMessage(chatId, {
      text:
        `⚡ *The foundation is set.*\n\n` +
        `One final seal remains. Your Mora's *signature special move* — the technique it calls its own, learned when a true bond forms.\n\n` +
        `*Format:*\n\`MoveName~Power~Accuracy~Category\`\n\n` +
        `Example: \`Bloomstrike~95~85~special\`\n\n` +
        `_Or *.cancel-create* to abandon._`,
      mentions: [senderId],
    });
  }

  if (pending.stage === "special") {
    const special = parseMove(text, 85);
    if (!special) {
      return sock.sendMessage(chatId, { text: `❌ Malformed move: \`${text}\`\n\nFormat: \`Name~Power~Accuracy~Category\`` }, { quoted: msg });
    }
    pending.draft.special = special;

    // ====== SUBMIT ======
    const player = players[senderId];
    const faction = player?.faction || "neutral";

    // Consume orb (unless owner)
    if (!isOwner) {
      const removed = itemsSystem.removeItem(player, ORB_ID, 1);
      if (!removed.ok) {
        pendingCreations.delete(senderId);
        return sock.sendMessage(chatId, { text: `❌ Failed to consume Reob.` }, { quoted: msg });
      }
    }

    // Roll stats and rarity
    const rarity = rollRarity(player);
    const baseStats = rollBaseStats(player);

    // Build move lists
    const moves = {};
    const learnset = { "1": [] };
    for (const mv of pending.draft.moves) {
      moves[mv.name] = { power: mv.power, accuracy: mv.accuracy, category: mv.category, desc: mv.desc };
      learnset["1"].push(mv.name);
    }
    const sp = special;
    moves[sp.name] = { power: sp.power, accuracy: sp.accuracy, category: sp.category, desc: "A signature move, learned through bond." };
    learnset["18"] = [sp.name];

    // Submit to submissions
    const subs = loadSubmissions();
    const id = subs.nextId++;
    const username = (player?.username && String(player.username).trim()) || senderId.split("@")[0];

    subs.pending[String(id)] = {
      id,
      creatorJid: senderId,
      creatorName: username,
      creatorFaction: faction,
      submittedAt: new Date().toISOString(),
      draft: {
        name: pending.draft.name,
        type: pending.draft.type,
        rarity,
        description: pending.draft.desc,
        baseStats,
        moves,
        learnset,
      },
    };
    saveSubmissions(subs);
    savePlayers(players);

    // Track creation and check achievements
    player.totalCreations = (player.totalCreations || 0) + 1;
    const rarityRank = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[rarity] || 1;
    if (!player.topCreationRarity || rarityRank > player.topCreationRarity) {
      player.topCreationRarity = rarityRank;
    }
    savePlayers(players);

    // Clear pending
    pendingCreations.delete(senderId);

    // Send confirmation
    await sock.sendMessage(chatId, {
      text:
        `${DIV}\n` +
        `✨ *CREATION SEALED*\n` +
        `${DIV}\n\n` +
        `📝 Submission #${id}\n` +
        `🐲 *${pending.draft.name}* — ${pending.draft.type} (${rarity})\n` +
        `🧬 HP ${baseStats.hp} · ATK ${baseStats.atk} · DEF ${baseStats.def} · SPD ${baseStats.spd} · ENG ${baseStats.energy}\n\n` +
        `The Array stabilizes your vision. Your Mora now rests with the Architect for judgment.\n\n` +
        `_You will receive a message when the verdict arrives._`,
      mentions: [senderId],
    }, { quoted: msg });
  }
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
    generation: 2,
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

  // Group announcement
  const groupMsg =
    `${DIV}\n` +
    `✨ *CREATION APPROVED*\n` +
    `${DIV}\n\n` +
    `@${s.creatorJid.split("@")[0]}, your design *${newMora.name}* has been accepted into the Lumora registry!\n\n` +
    `🐲 Mora #${newMora.id} — ${newMora.type} (${newMora.rarity})\n` +
    `${payLine}\n\n` +
    `_It may now be encountered and tamed by others._`;

  // DM to creator
  const dmMsg = `${DIV}\n✨ *CREATION APPROVED*\n${DIV}\n\nYour Mora *${newMora.name}* has been approved by the Architect!\n\n${payLine}\n\n_Check the Lumora registry to see your creation._`;

  try {
    await sock.sendMessage(s.creatorJid, { text: dmMsg });
  } catch (e) {
    console.log("DM send failed:", e?.message || e);
  }

  return sock.sendMessage(chatId, { text: groupMsg, mentions: [s.creatorJid] }, { quoted: msg });
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

  // Group announcement
  const mentions = players[s.creatorJid] ? [s.creatorJid] : [];
  const groupMsg =
    `${DIV}\n` +
    `❌ *CREATION REJECTED*\n` +
    `${DIV}\n\n` +
    `@${s.creatorJid.split("@")[0]}, your submission *${s.draft.name}* was rejected by the Architect.\n\n` +
    `_The Reob was consumed on submission and is not refunded._`;

  // DM to creator
  const dmMsg = `${DIV}\n❌ *CREATION REJECTED*\n${DIV}\n\nYour Mora *${s.draft.name}* was not approved by the Architect.\n\n_The Reob was consumed on submission._`;

  try {
    await sock.sendMessage(s.creatorJid, { text: dmMsg });
  } catch (e) {
    console.log("DM send failed:", e?.message || e);
  }

  return sock.sendMessage(chatId, { text: groupMsg, mentions }, { quoted: msg });
}

module.exports = {
  cmdCreateMora,
  cmdCancelCreate,
  cmdCreationsList,
  cmdApproveMora,
  cmdRejectMora,
  hasPendingCreation: (jid) => pendingCreations.has(jid),
  handlePendingCreation,
};
