// systems/spawn.js
const fs = require("fs");
const path = require("path");

const factionMarketSystem = require("./factionMarket");
const missionSystem       = require("./factionMissionSystem");

const DATA_DIR = path.join(__dirname, "..", "data");
const SPAWN_FILE = path.join(DATA_DIR, "spawn_state.json");
const IMAGE_DIR = path.join(__dirname, "..", "assets", "mora");

const SPAWN_EVERY_MS = 10 * 60 * 1000;
const WRONG_COOLDOWN_MS = 10 * 1000;

// NEW: if a spawn sits too long (no one catches), it auto-clears
const SPAWN_EXPIRE_MS = 6 * 60 * 1000; // 6 minutes (tweak if you want)

// --------------------
// SAFETY: avoid crashing on Baileys group session noise
// --------------------
function isSessionNoise(err) {
  const msg = String(err?.message || err || "");
  return /no sessions|failed to decrypt|sessionerror|bad mac/i.test(msg);
}

async function safeSend(sock, chatId, payload, fallbackText) {
  try {
    return await sock.sendMessage(chatId, payload);
  } catch (e) {
    if (!isSessionNoise(e)) {
      console.log("spawn safeSend ERROR:", e?.message || e);
    }
    // Retry once with text-only (images/media can trigger issues)
    try {
      const text = fallbackText || payload?.caption || payload?.text || "⚠️ (message failed)";
      return await sock.sendMessage(chatId, { text });
    } catch {
      return;
    }
  }
}

// --------------------
// RARITY
// --------------------
function normRarity(r) {
  const s = String(r || "").trim().toLowerCase();
  if (s === "common") return "common";
  if (s === "uncommon") return "uncommon";
  if (s === "rare") return "rare";
  if (s === "epic") return "epic";
  if (s === "legendary") return "legendary";
  if (s === "mythical" || s === "mythic") return "mythical";
  return "common";
}

const RARITY_WEIGHTS = {
  common: 50,
  uncommon: 25,
  rare: 10,
  epic: 7,
  legendary: 5,
  mythical: 3,
  
};

function weightedPick(list, weightFn) {
  let total = 0;
  const w = [];
  for (const item of list) {
    const ww = Math.max(0, Number(weightFn(item) || 0));
    if (ww > 0) {
      total += ww;
      w.push([item, ww]);
    }
  }
  if (total <= 0) return list[Math.floor(Math.random() * list.length)];

  let roll = Math.random() * total;
  for (const [item, ww] of w) {
    roll -= ww;
    if (roll <= 0) return item;
  }
  return w[w.length - 1][0];
}

function pickSpawnMora(moraList) {
  return weightedPick(moraList, (m) => {
    const r = normRarity(m?.rarity);
    return RARITY_WEIGHTS[r] ?? 1;
  });
}

function computeSpawnRateTable(moraList) {
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythical: 0 };
  for (const m of moraList) counts[normRarity(m?.rarity)]++;

  let totalScore = 0;
  const scores = {};
  for (const k of Object.keys(counts)) {
    const score = counts[k] * (RARITY_WEIGHTS[k] ?? 0);
    scores[k] = score;
    totalScore += score;
  }

  const pct = {};
  for (const k of Object.keys(scores)) {
    pct[k] = totalScore > 0 ? (scores[k] / totalScore) * 100 : 0;
  }

  return { counts, pct, weights: { ...RARITY_WEIGHTS } };
}

// --------------------
// STATE IO
// --------------------
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(SPAWN_FILE)) fs.writeFileSync(SPAWN_FILE, JSON.stringify({}, null, 2));
  try {
    const raw = fs.readFileSync(SPAWN_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.log("spawn loadState JSON error:", e?.message || e);
    return {};
  }
}

function saveState(state) {
  ensureDir();
  try {
    fs.writeFileSync(SPAWN_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.log("spawn saveState error:", e?.message || e);
  }
}

function getGroupState(state, groupJid) {
  if (!state[groupJid]) state[groupJid] = { active: null, lastSpawnAt: 0, wrongCd: {} };
  if (!state[groupJid].wrongCd) state[groupJid].wrongCd = {};
  return state[groupJid];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick3Names(moraList, correct) {
  const others = moraList.filter((m) => Number(m.id) !== Number(correct.id));
  const decoys = shuffle(others).slice(0, 2);
  return shuffle([correct.name, decoys[0]?.name, decoys[1]?.name].filter(Boolean));
}

function safeLower(s) {
  return String(s || "").trim().toLowerCase();
}

// --------------------
// IMAGE LOOKUP (cached)
// --------------------
let _fileMap = null;
let _fileMapAt = 0;
const FILEMAP_TTL_MS = 60 * 1000;

function listImageFilesLowerMapCached() {
  const now = Date.now();
  if (_fileMap && now - _fileMapAt < FILEMAP_TTL_MS) return _fileMap;

  try {
    if (!fs.existsSync(IMAGE_DIR)) {
      _fileMap = new Map();
      _fileMapAt = now;
      return _fileMap;
    }

    const files = fs.readdirSync(IMAGE_DIR);
    const map = new Map();
    for (const f of files) map.set(f.toLowerCase(), f);

    _fileMap = map;
    _fileMapAt = now;
    return _fileMap;
  } catch {
    _fileMap = new Map();
    _fileMapAt = now;
    return _fileMap;
  }
}

function imagePathFor(mora) {
  const id = Number(mora?.id ?? mora);
  const name = safeLower(mora?.name);
  const exts = [".png", ".jpg", ".jpeg", ".webp"];
  const fileMap = listImageFilesLowerMapCached();
  if (fileMap.size === 0) return null;

  for (const ext of exts) {
    const key = `id_${id}${ext}`.toLowerCase();
    const real = fileMap.get(key);
    if (real) return path.join(IMAGE_DIR, real);
  }

  if (name) {
    const compact = name.replace(/\s+/g, "");
    for (const ext of exts) {
      const key1 = `${name}${ext}`.toLowerCase();
      const key2 = `${compact}${ext}`.toLowerCase();
      const real1 = fileMap.get(key1);
      if (real1) return path.join(IMAGE_DIR, real1);
      const real2 = fileMap.get(key2);
      if (real2) return path.join(IMAGE_DIR, real2);
    }
  }

  return null;
}

// -------- MOVE POOL LOGIC --------
function buildMovePool(species) {
  const pool = new Set();

  if (species.moves && typeof species.moves === "object") {
    for (const m of Object.keys(species.moves)) pool.add(m);
  }

  if (species.learnset && typeof species.learnset === "object") {
    for (const level of Object.keys(species.learnset)) {
      const arr = species.learnset[level];
      if (Array.isArray(arr)) for (const m of arr) pool.add(m);
    }
  }

  return Array.from(pool);
}

function pickRandomMoves(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const count = Math.random() < 0.5 ? 4 : 5;
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

// --------------------
// SPAWN CORE
// --------------------
const groupLocks = new Set(); // prevents double spawn runs per group

function start(sock, loadMoraFn) {
  // keep file alive / create if missing
  setInterval(() => {
    try {
      const state = loadState();
      saveState(state);
    } catch {}
  }, 60 * 1000);
}

async function maybeSpawn(ctx, chatId) {
  const { sock, loadMora, settings } = ctx;

  // hard guard: groups only + feature toggle
  if (!chatId.endsWith("@g.us")) return;
  if (settings?.features?.groupSpawnsEnabled === false) return;

  // lock per group (prevents overlaps)
  if (groupLocks.has(chatId)) return;
  groupLocks.add(chatId);

  try {
    if (typeof loadMora !== "function") return;

    const moraList = loadMora();
    if (!Array.isArray(moraList) || moraList.length === 0) return;

    const state = loadState();
    const gs = getGroupState(state, chatId);

    // auto-expire stuck spawn
    if (gs.active?.spawnedAt && Date.now() - gs.active.spawnedAt > SPAWN_EXPIRE_MS) {
      gs.active = null;
      saveState(state);
    }

    if (gs.active) return;

    const now = Date.now();
    if (gs.lastSpawnAt && now - gs.lastSpawnAt < SPAWN_EVERY_MS) return;

    const chosen = pickSpawnMora(moraList);
    if (!chosen) return;

    const options = pick3Names(moraList, chosen);
    if (options.length < 3) return;

    gs.active = {
      moraId: Number(chosen.id),
      correctName: chosen.name,
      options,
      spawnedAt: now,
    };
    gs.lastSpawnAt = now;

    saveState(state);

    const caption =
      `🌿 *A wild Mora has appeared!* 🌿\n\n` +
      `Choose the correct name:\n` +
      `1) ${options[0]}\n` +
      `2) ${options[1]}\n` +
      `3) ${options[2]}\n\n` +
      `Type: *.catch <name>*`;

    const imgPath = imagePathFor(chosen);

    // ✅ IMPORTANT FIX:
    // Use Buffer for local images instead of { url: "C:\\path" } which can fail in groups.
    if (imgPath && fs.existsSync(imgPath)) {
      try {
        const buf = fs.readFileSync(imgPath);
        await safeSend(sock, chatId, { image: buf, caption }, caption);
      } catch (e) {
        if (!isSessionNoise(e)) console.log("spawn image read/send error:", e?.message || e);
        await safeSend(sock, chatId, { text: caption }, caption);
      }
    } else {
      await safeSend(sock, chatId, { text: caption }, caption);
    }
  } catch (e) {
    // swallow everything so group replies never die because of spawn
    if (!isSessionNoise(e)) console.log("maybeSpawn ERROR:", e?.stack || e);
  } finally {
    groupLocks.delete(chatId);
  }
}

async function cmdSpawnRates(ctx, chatId) {
  const { sock, loadMora } = ctx;
  const moraList = typeof loadMora === "function" ? loadMora() : [];
  if (!moraList.length) return safeSend(sock, chatId, { text: "❌ Mora list is empty." });

  const { counts, pct, weights } = computeSpawnRateTable(moraList);

  const lines = [
    `📊 *SPAWN RATES* (by rarity)`,
    ``,
    `Common: ${pct.common.toFixed(2)}%  (count ${counts.common}, weight ${weights.common})`,
    `Uncommon: ${pct.uncommon.toFixed(2)}%  (count ${counts.uncommon}, weight ${weights.uncommon})`,
    `Rare: ${pct.rare.toFixed(2)}%  (count ${counts.rare}, weight ${weights.rare})`,
    `Epic: ${pct.epic.toFixed(2)}%  (count ${counts.epic}, weight ${weights.epic})`,
    `Legendary: ${pct.legendary.toFixed(2)}%  (count ${counts.legendary}, weight ${weights.legendary})`,
    `Mythical: ${pct.mythical.toFixed(2)}%  (count ${counts.mythical}, weight ${weights.mythical})`,
    ``,
    `🛠️ Tune: edit RARITY_WEIGHTS in systems/spawn.js`,
  ];

  return safeSend(sock, chatId, { text: lines.join("\n") });
}

// --------------------
// CATCH
// --------------------
async function cmdCatch(ctx, chatId, senderId, args) {
  const { sock, players, savePlayers, loadMora } = ctx;

  if (!chatId.endsWith("@g.us")) {
    return safeSend(sock, chatId, { text: "❌ Spawns only work in groups." });
  }

  if (!players?.[senderId]) {
    return safeSend(sock, chatId, { text: "❌ Register first using .start" });
  }

  const guess = String(args.join(" ") || "").trim();
  if (!guess) return safeSend(sock, chatId, { text: "Use: .catch <name>" });

  const state = loadState();
  const gs = getGroupState(state, chatId);

  // auto-expire stuck spawn
  if (gs.active?.spawnedAt && Date.now() - gs.active.spawnedAt > SPAWN_EXPIRE_MS) {
    gs.active = null;
    saveState(state);
  }

  if (!gs.active) {
    return safeSend(sock, chatId, { text: "😴 No Mora is spawned right now." });
  }

  const now = Date.now();
  const cd = Number(gs.wrongCd?.[senderId] || 0);
  if (cd && now < cd) {
    const left = Math.ceil((cd - now) / 1000);
    return safeSend(sock, chatId, { text: `⏳ Cooldown: wait ${left}s then try again.` });
  }

  const correct = safeLower(gs.active.correctName);
  const g = safeLower(guess);

  if (g !== correct) {
    gs.wrongCd[senderId] = now + WRONG_COOLDOWN_MS;
    saveState(state);
    return safeSend(sock, chatId, { text: "❌ Wrong name! Try again in 10 seconds." });
  }

  const moraList = typeof loadMora === "function" ? loadMora() : [];
  const species = moraList.find((m) => Number(m.id) === Number(gs.active.moraId)) || null;

  if (!species) {
    gs.active = null;
    saveState(state);
    return safeSend(sock, chatId, { text: "⚠️ Mora data missing, spawn cleared." });
  }

  let owned;

  if (typeof ctx.createOwnedMoraFromSpecies === "function") {
    owned = ctx.createOwnedMoraFromSpecies(species);
  } else {
    owned = {
      moraId: Number(species.id),
      name: species.name,
      type: species.type,
      rarity: species.rarity,
      level: 1,
      xp: 0,
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

  // random moves
  const pool = buildMovePool(species);
  owned.moves = pickRandomMoves(pool);

  const catcher     = players[senderId];
  const catchFaction = catcher?.faction || "";

  // ── RIFT: 10% chance the Mora rejects the bond (non-Shadow only) ──
  if (factionMarketSystem.rollRiftUnstableCatch(catcher, species.type)) {
    gs.wrongCd[senderId] = Date.now() + 30000;
    saveState(state);
    return safeSend(sock, chatId, {
      text:
        `🔥 *RIFT BOND REJECTED!*\n\n` +
        `*${species.name}* senses the Rift energy in you and bolts!\n` +
        `_Non-Shadow Mora are unstable in Rift hands — 10% rejection chance._\n\n` +
        `Try again in 30 seconds.`,
    });
  }

  // ── HARMONY: small Lucon gift on successful catch ──
  if (catchFaction === "harmony" && catcher) {
    catcher.lucons = (Number(catcher.lucons) || 0) + 10;
  }

  if (!Array.isArray(catcher.moraOwned)) catcher.moraOwned = [];
  catcher.moraOwned.push(owned);

  // ── Mission hook ─────────────────────────────────────────
  try { missionSystem.onMoraCaught(senderId, catchFaction, species.type); } catch {}

  savePlayers(players);
  gs.active = null;
  saveState(state);

  const harmonyBonus = catchFaction === "harmony" ? "\n🌿 *Harmony Bond Bonus:* +10 Lucons!" : "";

  return safeSend(sock, chatId, {
    text:
      `✅ Correct! You caught *${species.name}* 🎉\n\n` +
      `Moves learned:\n• ${owned.moves.join("\n• ")}` +
      harmonyBonus,
  });
}

module.exports = {
  start,
  maybeSpawn,
  cmdCatch,
  cmdSpawnRates,
};