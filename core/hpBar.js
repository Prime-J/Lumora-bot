
function createHpBar(current, max) {
  const size = 12;

  if (max <= 0) return "░".repeat(size);

  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(size * ratio);
  const empty = size - filled;

  return "█".repeat(filled) + "░".repeat(empty);
}

module.exports = {
  createHpBar,
};