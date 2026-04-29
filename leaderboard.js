const fs = require('fs');

// 🧮 SCORING SYSTEM: Adjust these weights to balance your leaderboard!
function calculateTotalScore(p) {
    const aura = p.aura || 0;
    const tamedCount = Array.isArray(p.moraOwned) ? p.moraOwned.length : 0;
    const lucons = p.lucons || 0; // Assuming 'lucons' is the key in your player database

    // Formula: 1 Aura = 1 point | 1 Tamed Mora = 100 points | 1 Lucon = 0.5 points
    // (You can change these multipliers to whatever you want!)
    const score = (aura*100) + (tamedCount * 2) + Math.floor(lucons) ;
    
    return {
        total: score,
        aura,
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

    let text = "🌌 *LUMORA GLOBAL LEADERBOARD* 🌌\n_Top 10 strongest souls in the Dominion_\n\n";

    sorted.forEach((p, i) => {
        const rankNum = (i + 1).toString().padStart(2, '0'); // Makes #01, #02, etc.
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🔹";
        
        text += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
        text += `┃ ${medal} *#${rankNum}* • *${p.username || "Unknown"}*\n`;
        text += `┃ 💠 *Total Score:* ${p.stats.total.toLocaleString()}\n`;
        text += `┃ ├ 🔮 Aura: ${p.stats.aura.toLocaleString()}\n`;
        text += `┃ ├ 🐾 Tamed: ${p.stats.tamed}\n`;
        text += `┃ └ 💰 Lucons: ${p.stats.lucons.toLocaleString()}\n`;
        text += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    });
    
    return text;
}

function getFactionLeaderboard(players, factionName) {
    const factionMap = {
        "harmony": "🌿 Harmony Lumorians",
        "purity": "⚔️ The Purity Order",
        "rift": "🕶️ Rift Seekers"
    };

    // Filter by faction, sort by resonance
    const sorted = Object.values(players)
        .filter(p => p.faction === factionName)
        .map(p => ({ ...p, resonance: p.resonance || 0, stats: calculateTotalScore(p) }))
        .sort((a, b) => b.resonance - a.resonance)
        .slice(0, 10);

    if (sorted.length === 0) return `🌑 No members found in ${factionMap[factionName]}.`;

    let text = `🚩 *${factionMap[factionName].toUpperCase()}* 🚩\n_Top Contributors by Resonance_\n\n`;

    sorted.forEach((p, i) => {
        const rankNum = (i + 1).toString().padStart(2, '0');
        const icon = i === 0 ? "👑" : "▫️";

        text += `┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n`;
        text += `┃ ${icon} *#${rankNum}* • *${p.username || "Unknown"}*\n`;
        text += `┃ 🌀 *Resonance:* ${p.resonance.toLocaleString()}\n`;
        text += `┃ ├ 🔮 Aura: ${p.stats.aura.toLocaleString()}\n`;
        text += `┃ ├ 🐾 Tamed: ${p.stats.tamed}\n`;
        text += `┃ └ 💰 Lucons: ${p.stats.lucons.toLocaleString()}\n`;
        text += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n`;
    });

    return text;
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

module.exports = { getGlobalLeaderboard, getGlobalLeaderboardData, getFactionLeaderboard, checkNewLeader };