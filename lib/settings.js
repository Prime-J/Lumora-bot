// lib/settings.js
const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "data", "settings.json");

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("[SETTINGS] Failed to read settings.json:", e?.message || e);
    // Safe defaults so bot still runs
    return {
      botName: "Lumora",
      prefix: ".",
      currencyName: "LUCONS",
      ownerNumbers: [],
      features: { groupSpawnsEnabled: true, privateSpawnsEnabled: false, factionsEnabled: true },
      spawn: { minMessagesBetweenSpawns: 18, spawnChancePerMessage: 0.06 },
      media: { helpImagePath: "./media/lumora_logo.jpg" }
    };
  }
}

function saveSettings(newSettings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(newSettings, null, 2), "utf8");
}

module.exports = { readSettings, saveSettings, SETTINGS_PATH };