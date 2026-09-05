const fs = require('fs');
const ui = require('./systems/ui');
const progression = require('./systems/progression');
const interactiveUI = require('./systems/interactiveUI');

// 🧮 SCORING SYSTEM: Uses centralized progression engine
function calculateTotalScore(p) {
    const result = progression.calculateLeaderboardScore(p);
    const factionStat = progression.getFactionStat(p);
    const tamedCount = Array.isArray(p.moraOwned) ? p.moraOwned.length : 0;
    const lucons = p.lucons || 0;

    return {
        total: result.total,
        factionStat,
        aura: p.aura || 0,
        dep: p.xp || 0,
        level: p.level || 1,
        tamed: tamedCount,
        lucons
    };
}

// 0.1.3 — single source of truth for the global leaderboard ordering.
// Both the text renderer (.lb) and the canvas card pull from this so they
// can never disagree about who's #1.
function getGlobalLeaderboardData(players) {
    return Object.values(players)
        .map(p => ({ ...p, stats: calculateTotalScore(p) }))
        .sort((a, b) => b.stats.total - a.stats.total)
        .slice(0, 10);
}

function getGlobalLeaderboard(players) {
    const sorted = getGlobalLeaderboardData(players);

    const lines = [];
    lines.push(ui.header('LEADERBOARD', '🏆'));
    lines.push('  _Top 10 strongest souls in the Dominion_');
    lines.push('');

    // Top 3 highlighted
    const medals = ['🥇', '🥈', '🥉'];
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
        const p = sorted[i];
        const score = p.stats.total.toLocaleString();
        lines.push(ui.card(`${medals[i]} #${i + 1}`, '', [
            { emoji: '👤', label: 'Player', value: p.username || 'Unknown' },
            { emoji: '💠', label: 'Score', value: score },
            { emoji: '🔮', label: 'Aura', value: String(p.stats.aura) },
            { emoji: '🐾', label: 'Tamed', value: String(p.stats.tamed) },
            { emoji: '💰', label: 'Lucons', value: p.stats.lucons.toLocaleString() },
        ]));
        lines.push('');
    }

    // #1 gets a stat bar for visual flair
    if (sorted.length > 0) {
        const maxScore = sorted[0].stats.total;
        lines.push(ui.statBar(maxScore, maxScore));
        lines.push('  _#1 total power_');
        lines.push('');
    }

    // Ranks 4-10 compact
    if (sorted.length > 3) {
        lines.push(ui.DIV);
        lines.push('');
        for (let i = 3; i < sorted.length; i++) {
            const p = sorted[i];
            const rank = (i + 1).toString().padStart(2, ' ');
            lines.push(`  🔹 *#${rank}*  ${p.username || 'Unknown'}  —  💠 ${p.stats.total.toLocaleString()}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function getFactionLeaderboard(players, factionName) {
    const factionMap = {
        "harmony": "🌿 Harmony Lumorians",
        "purity": "⚔️ The Purity Order",
        "rift": "🕶️ Rift Seekers"
    };

    const statKey = progression.getFactionStatKey(factionName);
    const statEmoji = progression.getFactionStatEmoji(factionName);

    const sorted = Object.values(players)
        .filter(p => p.faction === factionName)
        .map(p => ({ ...p, factionStat: progression.getFactionStat(p), stats: calculateTotalScore(p) }))
        .sort((a, b) => b.factionStat - a.factionStat)
        .slice(0, 10);

    if (sorted.length === 0) return `🌑 No members found in ${factionMap[factionName]}.`;

    const lines = [];
    lines.push(ui.header(factionMap[factionName], '🚩'));
    lines.push(`  _Top Contributors by ${statKey.charAt(0).toUpperCase() + statKey.slice(1)}_`);
    lines.push('');

    // #1 highlighted
    if (sorted.length > 0) {
        const p = sorted[0];
        lines.push(ui.card('👑 #1', '', [
            { emoji: '👤', label: 'Player', value: p.username || 'Unknown' },
            { emoji: statEmoji, label: statKey.charAt(0).toUpperCase() + statKey.slice(1), value: p.factionStat.toLocaleString() },
            { emoji: '⭐', label: 'Level', value: String(p.stats.level) },
            { emoji: '🐾', label: 'Tamed', value: String(p.stats.tamed) },
            { emoji: '💰', label: 'Lucons', value: p.stats.lucons.toLocaleString() },
        ]));
        lines.push('');
    }

    // Ranks 2-10 compact
    if (sorted.length > 1) {
        lines.push(ui.DIV);
        lines.push('');
        for (let i = 1; i < sorted.length; i++) {
            const p = sorted[i];
            const rank = (i + 1).toString().padStart(2, ' ');
            lines.push(`  ▫️ *#${rank}*  ${p.username || 'Unknown'}  —  ${statEmoji} ${p.factionStat.toLocaleString()}  |  ⭐ Lv.${p.stats.level}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// Function to check and announce new leaders based on total power
async function checkNewLeader(sock, chatId, players, factionsData) {
    const factionNames = ["harmony", "purity", "rift"];
    let changed = false;

    for (const f of factionNames) {
        // Find top player by resonance
        const topPlayer = Object.values(players)
            .filter(p => p.faction === f)
            .sort((a, b) => (b.resonance || 0) - (a.resonance || 0))[0];

        if (topPlayer && topPlayer.id !== factionsData[f].currentLeader) {
            factionsData[f].currentLeader = topPlayer.id;
            changed = true;

            await sock.sendMessage(chatId, {
                text: `🔔 *FACTION ANNOUNCEMENT* 🔔\n\nThe winds of change blow through the ${f.toUpperCase()}!\n\n👑 *${topPlayer.username}* has ascended to become the new *Faction Leader* with the highest Resonance in the faction!\n\n_All hail the new vanguard!_`
            });
        }
    }
    return changed; // To tell index.js to save factions.json
}

module.exports = { getGlobalLeaderboard, getGlobalLeaderboardData, getFactionLeaderboard, checkNewLeader, sendLeaderboardMenu: interactiveUI.sendLeaderboardMenu };