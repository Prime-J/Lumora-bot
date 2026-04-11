function applyEffects(player, effects = {}, context = {}) {
  if (!effects) return;

  for (const key in effects) {
    const value = effects[key];

    switch (key) {

      // ❤️ HEALING
      case "heal":
        player.hp = Math.min(player.hp + value, player.maxHp);
        break;

      // ⚡ ENERGY
      case "energy":
        player.energy = (player.energy || 0) + value;
        break;

      // 🧬 MAX HP BOOST
      case "maxHp":
        player.maxHp += value;
        break;

      // 🌍 SPAWN RATE (used during hunt)
      case "spawnRate":
        context.spawnRate = (context.spawnRate || 1) * (1 + value / 100);
        break;

      // 🎯 CATCH BOOST
      case "catchChance":
        context.catchBonus = (context.catchBonus || 0) + value;
        break;

      // 💰 STORAGE
      case "storage":
        player.storage = (player.storage || 0) + value;
        break;

      // ⚡ ON-CATCH PASSIVE
      case "onCatchEnergy":
        player.passives = player.passives || {};
        player.passives.onCatchEnergy =
          (player.passives.onCatchEnergy || 0) + value;
        break;

      // 💀 ON-FAINT PASSIVE
      case "auraRestoreOnFaint":
        player.passives = player.passives || {};
        player.passives.auraRestoreOnFaint = value;
        break;

      // 🧼 CLEANSE
      case "removeCorruption":
        if (context.targetMora) {
          context.targetMora.corrupted = false;
        }
        break;

      // ⏳ DURATION (handled elsewhere)
      case "duration":
        break;

      default:
        // ignore unknown effects (safe)
        break;
    }
  }
}

module.exports = { applyEffects };