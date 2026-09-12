"use strict";
// ═══════════════════════════════════════════════════════════════
// DOWNLOAD COMMANDS — sends real media, only verified-live sources.
//
//   .tiktok <url>    → tikwm.com API    → video as { video } message
//   .tiktokmp3 <url> → tikwm music CDN  → audio as { audio } message
//   .twitter <url>   → vxtwitter API    → images sent all; video: first
//   .ytinfo <url>    → YouTube oEmbed   → title/author (no public DL API)
//
// Every platform here was probed live before being wired in; anything
// that failed (insta/fb/sc/yt-stream) is left out on purpose.
// ═══════════════════════════════════════════════════════════════

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ── fetch helpers (global fetch, Node 18+) ───────────────────────
// Defensive JSON parse: vxtwitter (and others) sometimes answer 200
// with an HTML bot-wall page. Turn that into a humanized error instead
// of leaking "Unexpected token '<'" to the user.
async function getJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  const body = await res.text();
  const looksHtml = ctype.includes("text/html") || /^\s*</.test(body);
  if (looksHtml) {
    throw new Error(`${opts.source || "the media source"} is rate-limiting right now — try again in a minute`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${opts.source || "the media source"} sent an unreadable response — try again shortly`);
  }
}

async function getBuffer(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// WhatsApp caps media around 16-100MB; videos over ~60MB fail to send
// and take forever to upload. Bail early with a clear message.
const MAX_MEDIA_BYTES = 60 * 1024 * 1024;

function guardMedia(buf) {
  if (buf.length > MAX_MEDIA_BYTES) {
    throw new Error(`file too large to send (${(buf.length / 1048576).toFixed(1)}MB)`);
  }
  if (buf.length < 4096) throw new Error("downloaded file is too small — likely an error page");
  return buf;
}

// ── TikTok (tikwm — verified live) ───────────────────────────────
async function tiktokResolve(url) {
  const j = await getJSON(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, { source: "TikTok's downloader" });
  const d = j?.data;
  if (j.code !== 0 || !d?.play) throw new Error("tikwm: no playable URL returned");
  return {
    videoUrl: d.play,
    musicUrl: d.music || null,
    title: d.title || "TikTok video",
    author: d.author?.nickname || d.author?.unique_id || "unknown",
    views: d.play_count || 0,
  };
}

// ── Twitter/X (vxtwitter — verified live) ────────────────────────
function extractTweetPath(url) {
  const m = url.match(/(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i);
  return m ? `${m[1]}/status/${m[2]}` : null;
}

async function twitterResolve(url) {
  const path = extractTweetPath(url);
  if (!path) throw new Error("Not a tweet URL (need x.com/<user>/status/<id>)");
  const j = await getJSON(`https://api.vxtwitter.com/${path}`, { source: "Twitter" });
  const media = j.mediaURLs || [];
  if (!media.length) throw new Error("tweet has no media");
  const isVideo = (u) => /\.(mp4|m3u8)(\?|$)/i.test(u) || /video\.twimg\.com/.test(u);
  return {
    // video tweets: one playable file. image tweets: send them all.
    mediaUrls: isVideo(media[0]) ? [media[0]] : media,
    isVideo: isVideo(media[0]),
    text: j.text || "",
    author: j.user_name || j.user_screen_name || "unknown",
  };
}

// ── YouTube (oEmbed metadata only — public stream APIs all dead) ─
function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

async function ytInfoResolve(url) {
  const id = extractYouTubeId(url);
  if (!id) throw new Error("Not a YouTube URL");
  const j = await getJSON(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
    { source: "YouTube" }
  );
  return {
    id,
    title: j.title || "Unknown",
    author: j.author_name || "unknown",
    thumbnail: j.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

// ── Media send helpers ───────────────────────────────────────────
async function sendMedia(sock, chatId, msg, { url, isVideo, caption }) {
  const buf = guardMedia(await getBuffer(url));
  const payload = isVideo ? { video: buf, caption } : { image: buf, caption };
  return sock.sendMessage(chatId, payload, { quoted: msg });
}

async function sendAudio(sock, chatId, msg, { url }) {
  const buf = guardMedia(await getBuffer(url));
  return sock.sendMessage(chatId, { audio: buf, mimetype: "audio/mpeg" }, { quoted: msg });
}

// ── Command handlers ─────────────────────────────────────────────
// Shared wrapper: "thinking" → job → send. On failure, sends a fresh
// error message — the plain-send pattern every other handler in this
// bot uses (message edits aren't exercised anywhere in this codebase).
async function withMediaReply(sock, chatId, msg, waitText, job) {
  await sock.sendMessage(chatId, { text: waitText }, { quoted: msg });
  try {
    return await job();
  } catch (e) {
    return sock.sendMessage(chatId, { text: `❌ ${e?.message || e}` }, { quoted: msg });
  }
}

async function handleTiktok(sock, chatId, msg, args) {
  const url = args[0];
  if (!url || !/tiktok\.com/i.test(url)) {
    return sock.sendMessage(chatId, { text: "Usage: .tiktok <TikTok URL>" }, { quoted: msg });
  }
  return withMediaReply(sock, chatId, msg, "⏳ Downloading TikTok video…", async () => {
    const r = await tiktokResolve(url);
    return sendMedia(sock, chatId, msg, {
      url: r.videoUrl,
      isVideo: true,
      caption: `📱 *${r.title}*\n👤 ${r.author} • 👀 ${r.views.toLocaleString()}`,
    });
  });
}

async function handleTiktokmp3(sock, chatId, msg, args) {
  const url = args[0];
  if (!url || !/tiktok\.com/i.test(url)) {
    return sock.sendMessage(chatId, { text: "Usage: .tiktokmp3 <TikTok URL>" }, { quoted: msg });
  }
  return withMediaReply(sock, chatId, msg, "⏳ Extracting audio…", async () => {
    const r = await tiktokResolve(url);
    if (!r.musicUrl) throw new Error("no audio track on this video");
    return sendAudio(sock, chatId, msg, { url: r.musicUrl });
  });
}

async function handleTwitter(sock, chatId, msg, args) {
  const url = args[0];
  if (!url || !/(twitter|x)\.com/i.test(url)) {
    return sock.sendMessage(chatId, { text: "Usage: .twitter <Tweet URL>" }, { quoted: msg });
  }
  return withMediaReply(sock, chatId, msg, "⏳ Fetching tweet media…", async () => {
    const r = await twitterResolve(url);
    const caption = `🐦 ${r.author}: ${r.text.slice(0, 180)}`;
    if (r.isVideo) {
      return sendMedia(sock, chatId, msg, { url: r.mediaUrls[0], isVideo: true, caption });
    }
    // Images: send every one, caption on the first.
    for (let i = 0; i < r.mediaUrls.length; i++) {
      await sendMedia(sock, chatId, msg, {
        url: r.mediaUrls[i],
        isVideo: false,
        caption: i === 0 ? caption + (r.mediaUrls.length > 1 ? `  (${i + 1}/${r.mediaUrls.length})` : "") : "",
      });
    }
  });
}

async function handleYtinfo(sock, chatId, msg, args, PREFIX) {
  const url = args[0];
  if (!url || !/youtu/.test(url)) {
    return sock.sendMessage(chatId, { text: `Usage: ${PREFIX}ytinfo <YouTube URL>` }, { quoted: msg });
  }
  try {
    const r = await ytInfoResolve(url);
    return sock.sendMessage(chatId, {
      image: await getBuffer(r.thumbnail),
      caption:
        `🎬 *${r.title}*\n👤 ${r.author}\n🔗 https://youtu.be/${r.id}\n\n` +
        `_Public YouTube stream APIs are currently unavailable, so I can't attach the file — use a YouTube downloader for the video itself._`,
    }, { quoted: msg });
  } catch (e) {
    return sock.sendMessage(chatId, { text: `❌ ${e?.message || e}` }, { quoted: msg });
  }
}

// ── Universal .dl — detect platform, route ───────────────────────
async function handleDl(sock, chatId, msg, args, PREFIX) {
  const url = args[0];
  if (!url) {
    return sock.sendMessage(chatId, {
      text:
        `📥 *Downloader*\n\n` +
        `• ${PREFIX}dl <TikTok URL> — video\n` +
        `• ${PREFIX}tiktokmp3 <URL> — audio only\n` +
        `• ${PREFIX}dl <Tweet URL> — media (all images)\n` +
        `• ${PREFIX}ytinfo <YouTube URL> — info card\n\n` +
        `_Instagram/Facebook/SoundCloud aren't supported — no reliable public API._`,
    }, { quoted: msg });
  }
  if (/tiktok\.com/i.test(url)) return handleTiktok(sock, chatId, msg, args);
  if (/(twitter|x)\.com/i.test(url)) return handleTwitter(sock, chatId, msg, args);
  if (/youtu(be\.com|\.be)/i.test(url)) return handleYtinfo(sock, chatId, msg, args, PREFIX);
  return sock.sendMessage(chatId, { text: "❌ Unsupported link. Supported: TikTok, Twitter/X, YouTube (info)." }, { quoted: msg });
}

// Route map — the single owner of command→handler wiring for this
// module. index.js consumes it in one line; adding a command means
// one entry here + one registry row, nothing else.
const ROUTES = {
  tiktok:    handleTiktok,
  tiktokmp3: handleTiktokmp3,
  twitter:   handleTwitter,
  x:         handleTwitter,
  ytinfo:    handleYtinfo,
  dl:        handleDl,
};

module.exports = { ROUTES };
