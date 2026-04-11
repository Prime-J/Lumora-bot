

const FORFEIT_PENALTY = 10;

// Clamp helper
function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}


function getPlayerLevel(player) {

  return Math.max(1, Number(player?.level || 1));
}


function calcAuraLoss(loserPlayer, winnerPlayer) {
  const loserLv = getPlayerLevel(loserPlayer);
  const winnerLv = getPlayerLevel(winnerPlayer);

  // Reduced loss — base 3 (lower level) or 5 (equal/higher)
  const base = loserLv > winnerLv ? 3 : 5;

  // Gentle scaling: +1 every 15 levels above level 5
  const scale = Math.floor((loserLv - 5) / 15);

  return clamp(base + Math.max(0, scale), 2, 8);
}

// Winner aura gain: mirror of loss, but slightly smaller so aura doesn't explode.
function calcAuraGain(winnerPlayer, loserPlayer) {
  const winnerLv = getPlayerLevel(winnerPlayer);
  const loserLv = getPlayerLevel(loserPlayer);

  // If winner beat a higher level → reward more
  const base = loserLv > winnerLv ? 10 : 7;

  // Winner level also gains more, scaling faster
  const scale = Math.floor((winnerLv - 5) / 10);

  // Higher cap so aura gain feels meaningful
  return clamp(base + Math.max(0, scale), 3, 18);
}

// Apply aura safely
function addAura(player, amount) {
  if (!player) return;
  const cur = Number(player.aura || 0);
  player.aura = clamp(cur + Number(amount || 0), 0, 9999);
}

function removeAura(player, amount) {
  if (!player) return;
  const cur = Number(player.aura || 0);
  player.aura = clamp(cur - Number(amount || 0), 0, 9999);
}

module.exports = {
  FORFEIT_PENALTY,
  getPlayerLevel,
  calcAuraLoss,
  calcAuraGain,
  addAura,
  removeAura,
};