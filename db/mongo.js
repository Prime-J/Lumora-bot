const mongoose = require("mongoose");

// MongoDB connection settings
const MONGODB_URI = process.env.MONGODB_URI || "";
console.log("[mongo] MONGODB_URI env var:", process.env.MONGODB_URI);

const FLUSH_INTERVAL = 3000; // 3 seconds, batched writes
const FLUSH_TIMEOUT = 5000; // 5 second timeout for graceful shutdown

let connected = false;
const dirtyJids = new Set(); // Track which JIDs need to write
let flushTimer = null;
let latestPlayersRef = null; // Always points to the most recent players object

/**
 * Player schema: stores JID + full data object
 * This is a 1:1 mapping of players.json entries but in MongoDB
 */
const PlayerSchema = new mongoose.Schema(
  {
    jid: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true } // createdAt, updatedAt automatically
);

const Player = mongoose.model("Player", PlayerSchema);

/**
 * Initialize MongoDB connection
 * Falls back gracefully if:
 * - No MONGODB_URI set
 * - Connection fails
 * Returns true if connected, false if using fallback
 */
async function initMongo() {
  if (!MONGODB_URI) {
    console.log("[mongo] MONGODB_URI not set, using file-based fallback");
    connected = false;
    return false;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    connected = true;
    console.log("[mongo] Connected to MongoDB Atlas");
    return true;
  } catch (err) {
    console.warn("[mongo] Connection failed:", err.message);
    connected = false;
    return false;
  }
}

/**
 * Load all players from MongoDB (or return empty if not connected)
 * Called once at bot startup
 */
async function loadAllPlayers() {
  if (!connected) {
    console.log("[mongo] Not connected, skipping MongoDB load");
    return {};
  }

  try {
    const docs = await Player.find({});
    const players = {};
    for (const doc of docs) {
      players[doc.jid] = doc.data || {};
    }
    console.log(`[mongo] Loaded ${Object.keys(players).length} players from MongoDB`);
    return players;
  } catch (err) {
    console.warn("[mongo] Error loading players:", err.message);
    return {};
  }
}

/**
 * Mark a JID as dirty (needs to be flushed to MongoDB)
 * Schedules a flush if one isn't already pending
 * @param {Object} players - The full players object (to extract data for this JID)
 * @param {string} jid - The JID to mark dirty
 */
function markDirty(players, jid) {
  if (!connected) return; // No-op if not connected

  dirtyJids.add(jid);
  latestPlayersRef = players; // Always keep the freshest reference

  // Schedule flush if not already pending
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      // Use latestPlayersRef — NOT the closure from the first markDirty
      // call — so we always flush the most recent player data.
      flushDirtyPlayers(latestPlayersRef).catch((err) => {
        console.warn("[mongo] Flush failed:", err.message);
      });
    }, FLUSH_INTERVAL);
  }
}

/**
 * Write all dirty JIDs to MongoDB in a single batch
 * @param {Object} players - The full players object
 */
async function flushDirtyPlayers(players) {
  if (!connected || dirtyJids.size === 0) {
    flushTimer = null;
    return;
  }

  const jidsToFlush = Array.from(dirtyJids);
  dirtyJids.clear();
  flushTimer = null;

  try {
    for (const jid of jidsToFlush) {
      const data = players[jid] || {};
      await Player.updateOne(
        { jid },
        { jid, data },
        { upsert: true } // Create if doesn't exist
      );
    }
    console.log(`[mongo] Flushed ${jidsToFlush.length} players to MongoDB`);
  } catch (err) {
    console.warn("[mongo] Batch flush failed:", err.message);
    // Re-add failed JIDs to try again next cycle
    jidsToFlush.forEach((jid) => dirtyJids.add(jid));
  }
}

/**
 * Gracefully close MongoDB connection
 * Flushes any pending writes before closing
 * Called on SIGTERM / SIGINT / process exit
 */
async function gracefulShutdown(players) {
  console.log("[mongo] Graceful shutdown initiated");

  if (connected && dirtyJids.size > 0) {
    console.log(`[mongo] Flushing ${dirtyJids.size} pending writes before shutdown...`);
    try {
      await Promise.race([
        flushDirtyPlayers(players),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Flush timeout")), FLUSH_TIMEOUT)
        ),
      ]);
    } catch (err) {
      console.warn("[mongo] Final flush failed (time limit or error):", err.message);
    }
  }

  if (connected) {
    try {
      await mongoose.connection.close();
      console.log("[mongo] Connection closed");
    } catch (err) {
      console.warn("[mongo] Error closing connection:", err.message);
    }
  }
}

module.exports = {
  initMongo,
  loadAllPlayers,
  markDirty,
  gracefulShutdown,
};
