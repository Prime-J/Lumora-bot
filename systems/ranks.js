// 0.1.3 — RANK SYSTEM
// 17-tier ladder derived from level. Newbies see 3+ promotions in their
// first week so progress feels real. Each tier has a colour scheme used
// by the canvas card.

const RANKS = [
  { name: "Spark",       min:   1, max:   2, color: "#bdbdbd", glow: "#ffffff" },
  { name: "Ember",       min:   3, max:   5, color: "#ff8a3d", glow: "#ffb573" },
  { name: "Apprentice",  min:   6, max:   9, color: "#7ec8ff", glow: "#b8e0ff" },
  { name: "Trainee",     min:  10, max:  13, color: "#22d3ee", glow: "#67e8f9" },
  { name: "Hunter",      min:  14, max:  18, color: "#4ade80", glow: "#86efac" },
  { name: "Ranger",      min:  19, max:  24, color: "#16a34a", glow: "#4ade80" },
  { name: "Veteran",     min:  25, max:  31, color: "#5b8def", glow: "#9ec1ff" },
  { name: "Warden",      min:  32, max:  39, color: "#3b82f6", glow: "#60a5fa" },
  { name: "Elite",       min:  40, max:  48, color: "#a855f7", glow: "#c084fc" },
  { name: "Knight",      min:  49, max:  58, color: "#7c3aed", glow: "#a78bfa" },
  { name: "Champion",    min:  59, max:  69, color: "#fbbf24", glow: "#fde68a" },
  { name: "Vanguard",    min:  70, max:  81, color: "#f97316", glow: "#fdba74" },
  { name: "Lumoran",     min:  82, max:  94, color: "#ef4444", glow: "#fca5a5" },
  { name: "Ascendant",   min:  95, max: 109, color: "#dc2626", glow: "#fb7185" },
  { name: "Riftborn",    min: 110, max: 129, color: "#e11d48", glow: "#f472b6" },
  { name: "Voidwalker",  min: 130, max: 154, color: "#581c87", glow: "#9333ea" },
  { name: "Architect",   min: 155, max: 9999, color: "#fbbf24", glow: "#ec4899", rainbow: true },
];

function rankForLevel(level) {
  const lv = Math.max(1, Number(level || 1));
  for (const r of RANKS) {
    if (lv >= r.min && lv <= r.max) return r;
  }
  return RANKS[RANKS.length - 1];
}

function nextRank(currentRank) {
  const idx = RANKS.findIndex(r => r.name === currentRank.name);
  if (idx < 0 || idx >= RANKS.length - 1) return null;
  return RANKS[idx + 1];
}

// Wraps an XP gain with ±15% jitter so progress never feels mechanical.
function jitterXp(amount) {
  const n = Number(amount) || 0;
  if (n <= 0) return n;
  return Math.max(1, Math.floor(n * (0.85 + Math.random() * 0.30)));
}

// Detects whether a level change crossed a rank threshold.
// Returns { crossed: true, oldRank, newRank } or { crossed: false }.
function detectRankUp(oldLevel, newLevel) {
  const o = rankForLevel(oldLevel);
  const n = rankForLevel(newLevel);
  if (o.name !== n.name) return { crossed: true, oldRank: o, newRank: n };
  return { crossed: false };
}

// Per-message rank-up tick. Compares player's current level vs the last
// level we showed a rank card for. If the rank tier changed, returns the
// promotion info so the caller can fire the reveal canvas. The marker
// (lastSeenRankLevel) gets updated regardless to avoid re-firing.
function checkRankUpTick(player) {
  if (!player) return null;
  const cur = Number(player.level || 1);
  const last = Number(player.lastSeenRankLevel || cur);
  if (cur === last) return null;
  const o = rankForLevel(last);
  const n = rankForLevel(cur);
  player.lastSeenRankLevel = cur;
  if (o.name === n.name) return null;
  return { oldRank: o, newRank: n };
}

module.exports = {
  RANKS,
  rankForLevel,
  nextRank,
  jitterXp,
  detectRankUp,
  checkRankUpTick,
};
