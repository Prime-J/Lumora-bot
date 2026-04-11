// ============================
// FACTION WAR SYSTEM (4 PLAYER BRACKET)
// ============================

let currentTournament = null;

// 🔧 CHANGEABLE: max players
const MAX_PLAYERS = 4;

// ============================
// CREATE TOURNAMENT
// ============================
function createTournament(playersList) {

  if (playersList.length !== MAX_PLAYERS) {
    return { ok:false, msg:`Need exactly ${MAX_PLAYERS} players.` }
  }

  currentTournament = {
    round: 1,
    matches: [
      [playersList[0], playersList[1]],
      [playersList[2], playersList[3]]
    ],
    winners: []
  };

  return { ok:true, tournament: currentTournament };
}

// ============================
// REPORT WINNER
// ============================
function reportWinner(winnerId) {

  if (!currentTournament) return { ok:false };

  currentTournament.winners.push(winnerId);

  // move to next round
  if (currentTournament.winners.length === 2 && currentTournament.round === 1) {
    currentTournament.round = 2;
    currentTournament.matches = [
      [currentTournament.winners[0], currentTournament.winners[1]]
    ];
    currentTournament.winners = [];
  }

  // final winner
  if (currentTournament.winners.length === 1 && currentTournament.round === 2) {
    const champion = currentTournament.winners[0];
    currentTournament = null;
    return { ok:true, champion };
  }

  return { ok:true, next:true };
}

// ============================
// VIEW BRACKET
// ============================
function getBracket() {
  return currentTournament;
}

module.exports = {
  createTournament,
  reportWinner,
  getBracket
};