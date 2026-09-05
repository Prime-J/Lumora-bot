// ╔═══════════════════════════════════════════════════════════════╗
// ║  LUMORA CLICKABLE BUTTONS  v5.0                               ║
// ║  Uses @ryuu-reinzz/button-helper (community GitHub helper)     ║
// ║                                                               ║
// ║  v5.0 — single message fix:                                  ║
// ║    • Sends interactive buttons FIRST (works on phone + PC).   ║
// ║    • Falls back to plain text ONLY if interactive fails.      ║
// ║    • NEVER sends two messages.                                ║
// ╚═══════════════════════════════════════════════════════════════╝
"use strict";

const fs = require("fs");
const path = require("path");
const {
  sendButtons: helperSendButtons,
  sendInteractiveMessage: helperSendInteractive,
} = require("@ryuu-reinzz/button-helper");

const MAP_FILE = path.join(__dirname, "..", "data", "button_labels.json");

// ── Label → command map (persisted) ───────────────────────────────
const LABEL_MAP = {};

try {
  if (fs.existsSync(MAP_FILE)) {
    Object.assign(LABEL_MAP, JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) || {});
  }
} catch (e) {
  console.log("[buttons] label map restore failed:", e?.message || e);
}

let _mapSaveTimer = null;
function persistMap() {
  clearTimeout(_mapSaveTimer);
  _mapSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
      fs.writeFileSync(MAP_FILE, JSON.stringify(LABEL_MAP, null, 2));
    } catch (e) {
      console.log("[buttons] label map persist failed:", e?.message || e);
    }
  }, 500);
}

function mapButton(label, command) {
  if (label && command) {
    LABEL_MAP[String(label)] = String(command);
    persistMap();
  }
}

function mapButtons(entries) {
  if (!entries || typeof entries !== "object") return;
  for (const [label, cmd] of Object.entries(entries)) mapButton(label, cmd);
}

function translateText(text) {
  return LABEL_MAP[String(text || "")] || text;
}

// ── Send ────────────────────────────────────────────────────────────
// v5.0: Send ONE message — try interactive buttons first,
// fall back to plain text ONLY if interactive throws an error.
async function sendButtons(sock, chatId, text, buttons, opts = {}) {
  const mentions = Array.isArray(opts.mentions) ? opts.mentions.filter(Boolean) : [];
  const sendOpts = opts.quoted ? { quoted: opts.quoted } : undefined;

  // No buttons — just plain text
  if (!Array.isArray(buttons) || !buttons.length) {
    const payload = { text };
    if (mentions.length) payload.mentions = mentions;
    return sock.sendMessage(chatId, payload, sendOpts);
  }

  // Normalize buttons
  const normalized = buttons.slice(0, 8).map((b) => {
    const label = typeof b === "string" ? b : String(b.text ?? b.displayText ?? "");
    const explicitId = typeof b === "object" && b.id ? String(b.id) : "";
    const id = explicitId || LABEL_MAP[label] || label;
    return { id, text: label };
  });

  // Try interactive buttons first
  try {
    const content = {
      text: String(text || ""),
      ...(opts.footer ? { footer: String(opts.footer) } : {}),
      ...(opts.title ? { title: String(opts.title) } : {}),
      buttons: normalized,
    };

    if (mentions.length) {
      const interactive = {
        text: content.text,
        ...(content.footer ? { footer: content.footer } : {}),
        ...(content.title ? { title: content.title } : {}),
        interactiveButtons: normalized.map((b) => ({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id }),
        })),
        contextInfo: { mentions },
      };
      return await helperSendInteractive(
        sock,
        chatId,
        interactive,
        sendOpts || {}
      );
    }

    return await helperSendButtons(
      sock,
      chatId,
      content,
      sendOpts || {}
    );
  } catch (e) {
    // Interactive failed — plain text fallback (single message)
    console.log("[buttons] interactive send failed, text fallback:", e?.message || e);
    const fallback = normalized.map((b) => `• ${b.text}`).join("\n");
    const payload = { text: `${text}\n\n${fallback}` };
    if (mentions.length) payload.mentions = mentions;
    return sock.sendMessage(chatId, payload, sendOpts);
  }
}

module.exports = { sendButtons, mapButton, mapButtons, translateText };
