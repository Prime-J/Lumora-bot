const mongoose = require("mongoose");

// MongoDB connection settings
const MONGODB_URI = process.env.MONGODB_URI || "";

const FLUSH_INTERVAL = 3000; // 3 seconds, batched writes
const FLUSH_TIMEOUT = 5000; // 5 second timeout for graceful shutdown
const CONNECT_TIMEOUT_MS = 45000;
const SOCKET_TIMEOUT_MS = 180000;
const SERVER_SELECTION_TIMEOUT_MS = 30000;
const LOAD_MAX_TIME_MS = 120000;

// Atlas M0 (free tier) clusters are automatically PAUSED after a period of
// inactivity, and a paused cluster withdraws its DNS SRV records — so the next
// connection fails with `querySrv ENOTFOUND` rather than a timeout. A ping is
// a real database operation, which is what keeps the cluster awake.
const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 min
// If the cluster is asleep at boot, keep retrying so the bot heals itself once
// someone hits Resume, instead of staying dead until the next manual redeploy.
const RECONNECT_INTERVAL_MS = 90 * 1000;

let connected = false;
let bootLoadFailed = false; // CRITICAL safety: set true if initial load errored;
                            // when true, ALL writes to Mongo are blocked so we can't
                            // overwrite real records with empty/garbage data.
const dirtyJids = new Set(); // Track which JIDs need to write
let flushTimer = null;
let latestPlayersRef = null; // Always points to the most recent players object
let keepAliveTimer = null;
let reconnectTimer = null;

// Periodic no-op query so an idle M0 cluster does not get auto-paused out from
// under us. Unref'd so it never holds the process open.
function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    if (!connected || !mongoose.connection.readyState) return;
    mongoose.connection.db
      .admin()
      .ping()
      .catch(() => { /* transient — the driver reconnects on its own */ });
  }, KEEPALIVE_INTERVAL_MS);
  if (keepAliveTimer.unref) keepAliveTimer.unref();
}

// Retry until Mongo is healthy, then restore the live roster. Without this the
// bot is bricked for the life of the container whenever the cluster is asleep
// at boot.
function startReconnectLoop() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    if (connected && !bootLoadFailed) return;

    console.warn("[mongo] Not healthy — retrying connection...");
    const up = await initMongo();
    if (!up) return;

    const loaded = await loadAllPlayers();
    if (loaded && Object.keys(loaded).length > 0) {
      // The roster we hold is whatever was in memory while disconnected; swap
      // it for the real data and re-enable writes.
      bootLoadFailed = false;
      global._lumoraPlayers = loaded;
      global._lumoraStorage = {
        ...(global._lumoraStorage || {}),
        mongoConfigured: !!MONGODB_URI,
        mongoConnected: true,
        bootLoadFailed: false,
        playersLoaded: Object.keys(loaded).length,
      };
      console.log(`🔥 Reconnected — ${Object.keys(loaded).length} players restored from MongoDB. 🔥`);
    }
  }, RECONNECT_INTERVAL_MS);
  if (reconnectTimer.unref) reconnectTimer.unref();
}

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
    console.error("");
    console.error("❌❌❌ MONGODB_URI NOT SET — NOT CONNECTED ❌❌❌");
    console.error("   Nothing will be persisted. Player progress is lost on every");
    console.error("   redeploy. Set MONGODB_URI on the Railway service.");
    console.error("   Verify with: node scripts/check_mongo.js");
    console.error("");
    connected = false;
    startReconnectLoop();
    return false;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      socketTimeoutMS: SOCKET_TIMEOUT_MS,
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      maxPoolSize: 5,
      retryReads: true,
    });
    connected = true;
    console.log("");
    console.log("🔥🔥🔥 MONGODB CONNECTED 🔥🔥🔥");
    console.log("   Player data is safe — saves now survive redeploys.");
    console.log("");
    startKeepAlive();
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
    return true;
  } catch (err) {
    console.error("");
    console.error("❌❌❌ MONGODB CONNECTION FAILED — NOT CONNECTED ❌❌❌");
    console.error(`   ${err.message}`);
    console.error("   If the message is `querySrv ENOTFOUND`, the cluster hostname");
    console.error("   does not resolve. On Atlas M0 the usual cause is an AUTO-PAUSED");
    console.error("   cluster — paused clusters drop their DNS records. Open the Atlas");
    console.error("   Clusters page and press Resume, then wait a minute.");
    console.error("   Other causes: a deleted cluster, a wrong hostname, or a bad URI.");
    console.error("   Verify with: node scripts/check_mongo.js");
    console.error("");
    connected = false;
    startReconnectLoop();
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

  const MAX_TRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      // Cursor loading avoids one giant array response timing out on slower
      // Railway <-> Atlas links.
      const players = {};
      const cursor = Player.find({})
        .select({ jid: 1, data: 1, _id: 0 })
        .lean()
        .batchSize(25)
        .maxTimeMS(LOAD_MAX_TIME_MS)
        .cursor();

      for await (const doc of cursor) {
        players[doc.jid] = doc.data || {};
      }
      console.log(`[mongo] Loaded ${Object.keys(players).length} players from MongoDB (attempt ${attempt})`);
      console.log("🔥 Roster loaded from MongoDB — this is the live data. 🔥");
      return players;
    } catch (err) {
      console.warn(`[mongo] Load attempt ${attempt}/${MAX_TRIES} failed:`, err.message);
      if (attempt < MAX_TRIES) {
        const wait = 3000 * attempt;
        console.log(`[mongo] Retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  // CRITICAL: every retry failed. Mark boot as failed so we never write garbage
  // to Mongo. Returning null is a sentinel — caller must distinguish "really
  // empty" from "couldn't read."
  bootLoadFailed = true;
  console.error("[mongo] CRITICAL: All load attempts failed. Mongo writes are now BLOCKED for this session.");
  return null;
}

function isBootLoadFailed() {
  return bootLoadFailed;
}

/**
 * Mark a JID as dirty (needs to be flushed to MongoDB)
 * Schedules a flush if one isn't already pending
 * @param {Object} players - The full players object (to extract data for this JID)
 * @param {string} jid - The JID to mark dirty
 */
function markDirty(players, jid) {
  if (!connected) return; // No-op if not connected
  if (bootLoadFailed) return; // Safety: never overwrite Mongo if we failed to read it

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
  isBootLoadFailed,
};
