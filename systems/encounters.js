const corruptionSystem = require("./corruption");

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr = []) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[randInt(0, arr.length - 1)];
}

function titleCase(str = "") {
  return String(str).replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeType(type = "") {
  return String(type || "").trim().toLowerCase();
}

function buildTypeBuckets(moraList = []) {
  const buckets = {};
  for (const m of moraList) {
    const t = normalizeType(m.type);
    if (!buckets[t]) buckets[t] = [];
    buckets[t].push(m);
  }
  return buckets;
}

function weightedPick(entries = []) {
  const valid = entries.filter((x) => Number(x.weight || 0) > 0);
  if (!valid.length) return null;

  const total = valid.reduce((a, b) => a + Number(b.weight || 0), 0);
  let roll = Math.random() * total;

  for (const e of valid) {
    roll -= Number(e.weight || 0);
    if (roll <= 0) return e.value;
  }

  return valid[valid.length - 1].value;
}

function weightedPickEncounterType() {
  return weightedPick([
    { value: "wild", weight: 46 },
    { value: "tracks", weight: 16 },
    { value: "item", weight: 14 },
    { value: "nothing", weight: 12 },
    { value: "environment", weight: 8 },
    { value: "corrupted", weight: 4 }
  ]);
}

function pickItemText() {
  return pick([
    "🧰 You discovered a supply cache hidden under loose terrain.",
    "✨ A strange shimmer reveals a useful item nearby.",
    "🎒 You found something left behind by another hunter.",
    "🪙 You uncover a resource tucked into the wilds."
  ]);
}

function pickNothingText() {
  return pick([
    "🌫 You search the area carefully, but nothing answers.",
    "🍂 The terrain stays quiet. No signs, no movement.",
    "👁 You scan the ground and horizon... nothing useful appears.",
    "🕳 The wilds swallow your effort. This hunt turns up empty."
  ]);
}

function pickTrackText(isCorrupted = false) {
  const normal = [
    "👣 Fresh tracks cut across the terrain.",
    "🪶 You spot movement signs — something passed through here recently.",
    "🌿 The environment carries a clear trail forward.",
    "🧭 You discover a promising trail in the wilds."
  ];

  const corrupted = [
    "☠ Twisted tracks scar the ground with corrupted pressure.",
    "🩸 A broken trail pulses with hostile Rift energy.",
    "🌑 The marks ahead are wrong — something corrupted moved through here.",
    "⚠ You find unstable tracks soaked in corruption."
  ];

  return pick(isCorrupted ? corrupted : normal);
}

function pickEnvironmentText() {
  return pick([
    "⚠ The terrain surges violently with environmental pressure.",
    "🌩 A sudden fluctuation sweeps through the area.",
    "🌀 Rift-touched wind tears across the field.",
    "🌍 The land shifts under your feet with hostile intent."
  ]);
}

function pickCorruptedPublicText(corruptionData) {
  return corruptionSystem.pickAnnouncementText(corruptionData);
}

function getDifficultyData(ground, difficulty) {
  return ground?.difficultyModes?.[difficulty] || null;
}

function calcWildLevel(diff) {
  const min = Math.max(1, Number(diff?.moraLevelMin || 1));
  const max = Math.max(min, Number(diff?.moraLevelMax || min));
  return randInt(min, max);
}

function calcWildStatMultiplier(diff) {
  return Math.max(1, Number(diff?.statMultiplier || 1));
}

function buildWeightedSpeciesPool(moraList = [], ground = {}) {
  const spawnBias = ground?.spawnBias || {};
  const buckets = buildTypeBuckets(moraList);
  const pool = [];

  for (const [rawType, rawWeight] of Object.entries(spawnBias)) {
    const type = normalizeType(rawType);
    const weight = Number(rawWeight || 0);
    if (weight <= 0) continue;

    if (type === "all") {
      for (const m of moraList) {
        pool.push({ value: m, weight });
      }
      continue;
    }

    const arr = buckets[type] || [];
    for (const m of arr) {
      pool.push({ value: m, weight });
    }
  }

  if (!pool.length) {
    for (const m of moraList) pool.push({ value: m, weight: 1 });
  }

  return pool;
}

function pickWildSpecies(moraList = [], ground = {}) {
  const pool = buildWeightedSpeciesPool(moraList, ground);
  return weightedPick(pool);
}

function rollTrackState(isCorrupted = false) {
  const normal = weightedPick([
    { value: "faint", weight: 28 },
    { value: "clear", weight: 42 },
    { value: "unstable", weight: 30 }
  ]);

  const corruptedState = weightedPick([
    { value: "corrupted", weight: 46 },
    { value: "unstable", weight: 32 },
    { value: "clear", weight: 22 }
  ]);

  return isCorrupted ? corruptedState : normal;
}

function getTrackLossChance(trackState, hasTrackTool = false) {
  if (hasTrackTool) return 0;

  const map = {
    faint: 0.42,
    clear: 0.18,
    unstable: 0.3,
    corrupted: 0.36
  };

  return Number(map[trackState] || 0.2);
}

function maybeLoseTrack(trackState, hasTrackTool = false) {
  return Math.random() < getTrackLossChance(trackState, hasTrackTool);
}

function pickNaturalCorrupted(corruptionData) {
  const all = corruptionSystem.getAllNaturalCorrupted(corruptionData);
  if (!all.length) return null;
  return pick(all);
}

function buildEncounter(ctx, options = {}) {
  const {
    moraList = [],
    ground = null,
    difficulty = "easy",
    riftState = "calm",
    forceType = null
  } = options;

  if (!ground) {
    return { ok: false, reason: "Missing ground." };
  }

  const diff = getDifficultyData(ground, difficulty);
  if (!diff) {
    return { ok: false, reason: "Invalid difficulty." };
  }

  const corruptionData = corruptionSystem.loadCorruptionData();
  const terrainSensitivity = Number(ground?.corruptionSensitivity || 0);

  let encounterType = forceType || weightedPickEncounterType();

  if (encounterType === "wild") {
    const forcedCorrupt = corruptionSystem.shouldCorruptHuntSpawn(
      corruptionData,
      terrainSensitivity,
      riftState
    );

    if (forcedCorrupt) encounterType = "corrupted";
  }

  if (encounterType === "wild") {
    const species = pickWildSpecies(moraList, ground);
    if (!species) return { ok: false, reason: "No species available." };

    return {
      ok: true,
      type: "wild",
      text: pick([
        "⚔ A wild Mora steps into your path.",
        "👁 A beast reveals itself in the terrain.",
        "🌿 You flush out a wild Mora from cover.",
        "🩸 A hostile Mora emerges with battle intent."
      ]),
      wild: {
        baseId: species.id,
        name: species.name,
        level: calcWildLevel(diff),
        statMultiplier: calcWildStatMultiplier(diff),
        allowCapture: true,
        allowPurify: false,
        forceCorrupted: false
      }
    };
  }

  if (encounterType === "corrupted") {
    const useNatural = Math.random() < 0.32;
    if (useNatural) {
      const natural = pickNaturalCorrupted(corruptionData);
      if (!natural) {
        encounterType = "wild";
      } else {
        return {
          ok: true,
          type: "corrupted",
          publicAnnouncement: pickCorruptedPublicText(corruptionData),
          text: pickTrackText(true),
          wild: {
            naturalCorruptedId: natural.id,
            name: natural.name,
            level: calcWildLevel(diff) + randInt(1, 3),
            statMultiplier: calcWildStatMultiplier(diff) + 0.08,
            allowCapture: false,
            allowPurify: true,
            forceCorrupted: false
          }
        };
      }
    }

    const species = pickWildSpecies(moraList, ground);
    if (!species) return { ok: false, reason: "No species available for corruption." };

    return {
      ok: true,
      type: "corrupted",
      publicAnnouncement: pickCorruptedPublicText(corruptionData),
      text: pickTrackText(true),
      wild: {
        baseId: species.id,
        name: species.name,
        level: calcWildLevel(diff) + randInt(1, 2),
        statMultiplier: calcWildStatMultiplier(diff) + 0.06,
        allowCapture: true,
        allowPurify: false,
        forceCorrupted: true
      }
    };
  }

  if (encounterType === "tracks") {
    const maybeCorrupted = Math.random() < clamp(terrainSensitivity + 0.08, 0, 0.75);
    return {
      ok: true,
      type: "tracks",
      text: pickTrackText(maybeCorrupted),
      tracks: {
        state: rollTrackState(maybeCorrupted),
        corrupted: maybeCorrupted,
        expiresAt: Date.now() + 180000
      }
    };
  }

  if (encounterType === "item") {
    return {
      ok: true,
      type: "item",
      text: pickItemText(),
      itemEvent: {
        rewardTier: weightedPick([
          { value: "minor", weight: 60 },
          { value: "standard", weight: 30 },
          { value: "rare", weight: 10 }
        ])
      }
    };
  }

  if (encounterType === "environment") {
    return {
      ok: true,
      type: "environment",
      text: pickEnvironmentText(),
      environmentEvent: {
        severity: weightedPick([
          { value: "low", weight: 48 },
          { value: "mid", weight: 36 },
          { value: "high", weight: 16 }
        ]),
        terrain: ground.id
      }
    };
  }

  return {
    ok: true,
    type: "nothing",
    text: pickNothingText()
  };
}

module.exports = {
  buildEncounter,
  maybeLoseTrack,
  getTrackLossChance,
  buildWeightedSpeciesPool,
  pickWildSpecies,
  calcWildLevel,
  calcWildStatMultiplier,
  getDifficultyData,
  titleCase
};