// /lib/leaderboard/leaderboard.js

function calculateScore(player) {
    return (
        (player.level || 0) * 5 +
        (player.xp || 0) * 0.05 +
        (player.tamed?.length || 0) * 20 +
        (player.huntsCompleted || 0) * 15 +
        (player.aura || 0) * 2 +
        (player.intelligence || 0) * 2 +
        (player.tameSkill || 0) * 2
    );
}

// Sorting logic
function sortPlayers(players, type = "overall") {
    let sorted = [...players];

    switch (type) {
        case "aura":
            sorted.sort((a, b) => (b.aura || 0) - (a.aura || 0));
            break;

        case "intelligence":
            sorted.sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0));
            break;

        case "tameSkill":
            sorted.sort((a, b) => (b.tameSkill || 0) - (a.tameSkill || 0));
            break;

        case "lucons":
            sorted.sort((a, b) => (b.lucons || 0) - (a.lucons || 0));
            break;

        case "tamed":
            sorted.sort((a, b) => (b.tamed?.length || 0) - (a.tamed?.length || 0));
            break;

        case "hunts":
            sorted.sort((a, b) => (b.huntsCompleted || 0) - (a.huntsCompleted || 0));
            break;

        default:
            sorted.sort((a, b) => calculateScore(b) - calculateScore(a));
    }

    return sorted.slice(0, 20); // 🔥 limit to top 20 globally
}

// Format numbers
function format(num) {
    return Number(num || 0).toLocaleString();
}

// Get faction display
function getFaction(player) {
    return player.faction || "No Faction";
}

// Build leaderboard UI with pagination
function buildLeaderboard(players, type = "overall", page = 1) {
    const sorted = sortPlayers(players, type);

    const perPage = 10;
    const start = (page - 1) * perPage;
    const pageData = sorted.slice(start, start + perPage);

    let titleMap = {
        overall: "🌌 LUMORA GLOBAL LEADERBOARD",
        aura: "✨ AURA LEADERBOARD",
        intelligence: "🧠 INTELLIGENCE LEADERBOARD",
        tameSkill: "🎯 TAME SKILL LEADERBOARD",
        lucons: "💰 LUCONS LEADERBOARD",
        tamed: "🐾 MOST TAMED MORA",
        hunts: "🏹 HUNTS COMPLETED"
    };

    let text = `\n${titleMap[type] || "🏆 LEADERBOARD"} (Page ${page}/2)\n`;
    text += "━━━━━━━━━━━━━━━━━━\n";

    pageData.forEach((p, i) => {
        let globalRank = start + i + 1;
        let name = p.username || "Unknown";
        let faction = getFaction(p);

        if (type === "overall") {
            text += `#${globalRank} ${name} [${faction}]\n`;
            text += `Lvl:${p.level || 0} | XP:${format(p.xp)} | 🐾:${p.tamed?.length || 0} | 🏹:${p.huntsCompleted || 0}\n`;
            text += `Aura:${p.aura || 0} | Int:${p.intelligence || 0} | Tame:${p.tameSkill || 0}\n`;
            text += `Score: ${Math.floor(calculateScore(p))}\n`;
        } else {
            let value;

            switch (type) {
                case "aura": value = p.aura; break;
                case "intelligence": value = p.intelligence; break;
                case "tameSkill": value = p.tameSkill; break;
                case "lucons": value = p.lucons; break;
                case "tamed": value = p.tamed?.length; break;
                case "hunts": value = p.huntsCompleted; break;
            }

            text += `#${globalRank} ${name} [${faction}] → ${format(value)}\n`;
        }

        text += "━━━━━━━━━━━━━━━━━━\n";
    });

    return text.trim();
}

module.exports = {
    buildLeaderboard,
    sortPlayers,
    calculateScore
};