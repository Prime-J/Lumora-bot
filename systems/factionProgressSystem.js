// ============================
// FACTION PROGRESS SYSTEM
// ============================

const fs = require("fs")
const path = require("path")

const FILE = path.join(__dirname, "..", "data", "factions.json")
const FP_FILE = path.join(__dirname, "..", "data", "faction_points.json")

// ============================
// LOAD / SAVE
// ============================
function loadFactions() {
  if (!fs.existsSync(FILE)) {
    const base = {
      harmony: { points: 0, wins: 0 },
      purity: { points: 0, wins: 0 },
      rift: { points: 0, wins: 0 }
    }
    fs.writeFileSync(FILE, JSON.stringify(base, null, 2))
    return base
  }

  return JSON.parse(fs.readFileSync(FILE))
}

function saveFactions(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

// ============================
// ADD FACTION POINTS
// ============================
function addFactionPoints(faction, amount) {

  // 🔧 CHANGEABLE: max points per action (anti abuse)
  const MAX_GAIN = 100

  const data = loadFactions()

  if (!data[faction]) return false

  const gain = Math.min(amount, MAX_GAIN)

  data[faction].points += gain

  saveFactions(data)

  // Also sync to faction_points.json (used by .facpoints & .facprogress)
  try {
    let fp = { harmony: 0, purity: 0, rift: 0 }
    if (fs.existsSync(FP_FILE)) fp = JSON.parse(fs.readFileSync(FP_FILE))
    fp[faction] = (fp[faction] || 0) + gain
    fs.writeFileSync(FP_FILE, JSON.stringify(fp, null, 2))
  } catch {}

  return true
}

// ============================
// END SEASON
// ============================
function endSeason() {

  const data = loadFactions()

  let winner = null
  let max = -1

  for (const f in data) {
    if (data[f].points > max) {
      max = data[f].points
      winner = f
    }
  }

  if (winner) {
    data[winner].wins += 1
  }

  // 🔧 CHANGEABLE: reset points after season (true/false)
  const RESET_POINTS = true

  if (RESET_POINTS) {
    for (const f in data) {
      data[f].points = 0
    }
  }

  saveFactions(data)

  return winner
}

module.exports = {
  addFactionPoints,
  endSeason,
  loadFactions
}