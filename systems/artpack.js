// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA ART PACK v1.0                                          ║
// ║                                                                ║
// ║  Gives every Mora anime art for spawn cards / biographies:     ║
// ║    • Custom art first  (assets/mora/<name>.png — your own art)  ║
// ║    • Pack art second   (assets/artpack/id_<id>.png)             ║
// ║    • Live fetch last   (nekos.best API, cached to artpack)      ║
// ║                                                                ║
// ║  The pack is source-agnostic: drop ANY images (Kaggle anime     ║
// ║  dataset, Danbooru subset, fanart) into assets/artpack named    ║
// ║  id_<id>.png / <id>.png / <name>.png and they take priority     ║
// ║  over the live API.                                             ║
// ║                                                                ║
// ║  Tier design note: the pack supplies the RAW ART. Rarity tiers  ║
// ║  (borders, glow, colours) are drawn by Lumora's own card        ║
// ║  canvases on top — every Mora keeps its Common→Legendary tier.  ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs = require("fs");
const path = require("path");

const ART_DIR   = path.join(__dirname, "..", "assets", "artpack");
const MORA_DIR  = path.join(__dirname, "..", "assets", "mora");
const META_FILE = path.join(__dirname, "..", "data", "artpack_meta.json");

// ── Live art source (nekos.best — no key, needs their UA) ─────────
const API_BASE   = "https://nekos.best/api/v2";
const USER_AGENT = "nekos.best-api/v1.0";
const CATEGORIES = ["waifu", "neko", "husbando", "kitsune", "kemonomimi"];

function ensureDir() {
  if (!fs.existsSync(ART_DIR)) fs.mkdirSync(ART_DIR, { recursive: true });
}
function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}
function saveMeta(meta) {
  ensureDir();
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ── Resolve ───────────────────────────────────────────────────────
// Pack art path for a Mora (custom assets/mora art is handled by the
// callers' moraImagePath/imagePathFor — this only covers the pack).
function artPathFor(mora) {
  const id   = Number(mora?.id ?? mora?.moraId ?? 0);
  const name = String(mora?.name || "").toLowerCase().replace(/\s+/g, "");
  if (!id && !name) return null;
  ensureDir();
  if (!fs.existsSync(ART_DIR)) return null;
  let files;
  try { files = fs.readdirSync(ART_DIR); } catch { return null; }
  const lower = new Map();
  for (const f of files) lower.set(f.toLowerCase(), f);
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    if (id) {
      for (const base of [`id_${id}`, `${id}`]) {
        const real = lower.get((base + ext).toLowerCase());
        if (real) return path.join(ART_DIR, real);
      }
    }
    if (name) {
      const real = lower.get((name + ext).toLowerCase());
      if (real) return path.join(ART_DIR, real);
    }
  }
  return null;
}

// ── Live fetch + cache ────────────────────────────────────────────
// Downloads one image, resizes to fit `size` px, saves as JPEG.
async function fetchArtFor(mora, { size = 800, quality = 82 } = {}) {
  const id   = Number(mora?.id ?? 0);
  const name = String(mora?.name || "").toLowerCase().replace(/\s+/g, "");
  if (!id && !name) return { ok: false, reason: "no id/name" };

  const category = CATEGORIES[Math.abs(id) % CATEGORIES.length];
  const meta = loadMeta();
  const entry = { source: "nekos.best", category, fetchedAt: Date.now() };

  try {
    // 1. JSON → image URL (rotate categories; fall back to waifu)
    let url = null;
    for (const cat of [category, "waifu"]) {
      try {
        const res = await fetch(`${API_BASE}/${cat}`, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) continue;
        const j = await res.json();
        url = j?.results?.[0]?.url;
        entry.category = cat;
        if (url) break;
      } catch { /* try next */ }
    }
    if (!url) return { ok: false, reason: "api unavailable" };

    // 2. Download the image bytes (same UA required by their CDN)
    const imgRes = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!imgRes.ok) return { ok: false, reason: `image http ${imgRes.status}` };
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 2000) return { ok: false, reason: "image too small" };

    // 3. Resize + save as JPEG (keeps the pack lean on disk)
    const outBuf = await resizeToJpeg(buf, size, quality);
    ensureDir();
    const outPath = path.join(ART_DIR, `id_${id}.jpg`);
    fs.writeFileSync(outPath, outBuf);

    meta[String(id)] = { ...entry, url, bytes: outBuf.length, file: path.basename(outPath) };
    saveMeta(meta);
    return { ok: true, path: outPath, bytes: outBuf.length };
  } catch (e) {
    return { ok: false, reason: e?.message || "fetch error" };
  }
}

async function resizeToJpeg(buf, maxSize, quality) {
  try {
    const { createCanvas, loadImage } = require("@napi-rs/canvas");
    const img = await loadImage(buf);
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toBuffer("image/jpeg", quality);
  } catch {
    // canvas unavailable — cache the raw image instead
    return buf;
  }
}

// ── Fill missing ──────────────────────────────────────────────────
// Fetch art for every Mora that lacks both custom art and pack art.
async function fillMissing({ limit = 0, onProgress } = {}) {
  let moraList = [];
  try {
    moraList = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "mora.json"), "utf8"));
  } catch (e) {
    return { ok: false, reason: `mora.json read failed: ${e?.message}` };
  }

  const missing = moraList.filter((m) => !hasAnyArt(m));
  const targets = limit > 0 ? missing.slice(0, limit) : missing;
  const results = { fetched: 0, failed: 0, errors: [] };

  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    const r = await fetchArtFor(m);
    if (r.ok) results.fetched++;
    else {
      results.failed++;
      if (results.errors.length < 5) results.errors.push(`${m.name}: ${r.reason}`);
    }
    if (onProgress) onProgress({ done: i + 1, total: targets.length, mora: m.name, ok: r.ok });
    // be gentle with the API
    await new Promise((res) => setTimeout(res, 150));
  }
  results.total = targets.length;
  return results;
}

function hasAnyArt(mora) {
  const id = Number(mora?.id ?? 0);
  const name = String(mora?.name || "").toLowerCase().replace(/\s+/g, "");
  // custom art in assets/mora
  if (fs.existsSync(MORA_DIR)) {
    try {
      const files = fs.readdirSync(MORA_DIR);
      for (const f of files) {
        const l = f.toLowerCase();
        if (id && (l === `id_${id}.png` || l === `id_${id}.jpg` || l === `${id}.png` || l === `${id}.jpg`)) return true;
        if (name && (l === `${name}.png` || l === `${name}.jpg`)) return true;
      }
    } catch {}
  }
  return !!artPathFor(mora);
}

// ── Status ────────────────────────────────────────────────────────
function getStatus() {
  let moraList = [];
  try {
    moraList = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "mora.json"), "utf8"));
  } catch { return { ok: false }; }
  const meta = loadMeta();
  let custom = 0, pack = 0, missing = 0;
  const missingNames = [];
  for (const m of moraList) {
    const id = Number(m?.id ?? 0);
    const hasCustom = hasCustomArt(m);
    if (hasCustom) custom++;
    else if (artPathFor(m)) pack++;
    else if (meta[String(id)]) pack++; // meta says cached
    else { missing++; missingNames.push(m.name); }
  }
  let packFiles = 0;
  try { packFiles = fs.existsSync(ART_DIR) ? fs.readdirSync(ART_DIR).length : 0; } catch {}
  return {
    total: moraList.length,
    custom,
    pack,
    missing,
    packFiles,
    missingNames: missingNames.slice(0, 12),
    liveSource: "nekos.best (no key, UA required)",
    dirs: { artpack: ART_DIR, mora: MORA_DIR },
  };
}

function hasCustomArt(mora) {
  const id = Number(mora?.id ?? 0);
  const name = String(mora?.name || "").toLowerCase().replace(/\s+/g, "");
  if (!fs.existsSync(MORA_DIR)) return false;
  try {
    const files = fs.readdirSync(MORA_DIR);
    for (const f of files) {
      const l = f.toLowerCase();
      if (id && (l === `id_${id}.png` || l === `id_${id}.jpg` || l === `${id}.png` || l === `${id}.jpg`)) return true;
      if (name && (l === `${name}.png` || l === `${name}.jpg`)) return true;
    }
  } catch {}
  return false;
}

function clearArt(idOrName) {
  const mora = typeof idOrName === "object" ? idOrName : null;
  const id = Number(mora?.id ?? idOrName ?? 0);
  const name = String(mora?.name || "").toLowerCase().replace(/\s+/g, "");
  let removed = 0;
  ensureDir();
  if (fs.existsSync(ART_DIR)) {
    for (const f of fs.readdirSync(ART_DIR)) {
      const l = f.toLowerCase();
      if ((id && (l === `id_${id}.jpg` || l === `id_${id}.png` || l === `${id}.jpg` || l === `${id}.png`)) ||
          (name && (l === `${name}.jpg` || l === `${name}.png`))) {
        try { fs.unlinkSync(path.join(ART_DIR, f)); removed++; } catch {}
      }
    }
  }
  if (id) {
    const meta = loadMeta();
    if (meta[String(id)]) { delete meta[String(id)]; saveMeta(meta); }
  }
  return removed;
}

module.exports = { artPathFor, fetchArtFor, fillMissing, getStatus, hasAnyArt, hasCustomArt, clearArt, ART_DIR, MORA_DIR };
