// ══════════════════════════════════════════════════════════════
// LUMORA UI SYSTEM — Consistent text formatting
// ══════════════════════════════════════════════════════════════
// Every bot response uses these helpers for visual hierarchy.
// Headers, cards, dividers, choices — all from one place.
//
// UI RULE: Every response should be visually structured.
// Use consistent headers, dividers, spacing, emojis and boxed information.
// Avoid plain walls of text. Major screens have a recognizable header,
// sections use dividers, choices are numbered clearly, and important
// information is presented as cards/tables.

const DIV = "─────────────────────────";
const DIV_SHORT = "────────────────";

// ─── HEADERS ─────────────────────────────────────────────────

/**
 * Major screen header — used for profile, inventory, leaderboards
 * ╔═══════════════════════════════╗
 * ║       🌌 L U M O R A         ║
 * ╚═══════════════════════════════╝
 */
function header(text, emoji = "") {
  const tag = emoji ? `${emoji} ${text}` : text;
  // Calculate padding to center the text
  const innerWidth = 29;
  const content = `       ${tag}`;
  const padRight = Math.max(0, innerWidth - content.length);
  return `╔${"═".repeat(innerWidth)}╗\n║${content}${" ".repeat(padRight)} ║\n╚${"═".repeat(innerWidth)}╝`;
}

/**
 * Subsection header — used for sub-sections within a screen
 * ───────────────── ✖ FACTION ─────────────────
 */
function subheader(text, emoji = "") {
  const tag = emoji ? `${emoji} ${text}` : text;
  const sides = Math.floor((35 - tag.length - 2) / 2);
  const left = "─".repeat(Math.max(3, sides));
  const right = "─".repeat(Math.max(3, sides));
  return `${left} ${tag} ${right}`;
}

/**
 * Small divider — inline separator
 */
function divider() {
  return DIV;
}

// ─── INFORMATION CARDS ───────────────────────────────────────

/**
 * Information card — structured key-value display
 * ╔═══════════════════════════════╗
 * ║       📋 PROFILE             ║
 * ╠═══════════════════════════════╣
 * ║  👤 Name     : Prime         ║
 * ║  🎂 Age      : 18            ║
 * ╚═══════════════════════════════╝
 *
 * rows: [{ emoji, label, value }]
 */
function card(title, emoji, rows = []) {
  const innerWidth = 29;
  const lines = [];
  
  // Header
  const tag = emoji ? `${emoji} ${title}` : title;
  const content = `       ${tag}`;
  const padRight = Math.max(0, innerWidth - content.length);
  lines.push(`╔${"═".repeat(innerWidth)}╗`);
  lines.push(`║${content}${" ".repeat(padRight)} ║`);
  lines.push(`╠${"═".repeat(innerWidth)}╣`);

  // Rows
  if (rows.length > 0) {
    for (const row of rows) {
      const e = row.emoji ? `${row.emoji} ` : "   ";
      const labelText = `*${row.label}*`;
      const pad = Math.max(0, 10 - row.label.length);
      const rowContent = `${e}${labelText}${" ".repeat(pad)} : ${row.value}`;
      const rowPad = Math.max(0, innerWidth - rowContent.length + 2); // +2 for bold markdown
      lines.push(`║  ${rowContent}${" ".repeat(Math.max(0, rowPad - 2))}║`);
    }
  }

  lines.push(`╚${"═".repeat(innerWidth)}╝`);
  return lines.join("\n");
}

// ─── CHOICE LISTS ────────────────────────────────────────────

/**
 * Choice list — numbered options with visual hierarchy
 * ───────────────── ✖ CHOOSE YOUR PATH ─────────────────
 *
 *  ◉ 🔥 HARMONY LUMORIANS
 *     Seek balance and unity.
 *
 *  ◉ 🌑 THE PURITY ORDER
 *     Pursue purity above all.
 *
 *  ◉ 💀 THE RIFT SEEKERS
 *     Seek the mysteries beyond.
 * ─────────────────────────────────────────
 *  ⚠ Your faction will shape your journey through Lumora.
 */
function choiceList(title, emoji, choices, footer = "") {
  const lines = [];
  lines.push(subheader(title, emoji));
  lines.push("");

  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    const bullet = "◉";
    if (typeof c === "string") {
      lines.push(`${bullet} *${c}*`);
    } else {
      // { emoji, label, desc? }
      const e = c.emoji ? `${c.emoji} ` : "";
      lines.push(`${bullet} ${e}*${c.label}*`);
      if (c.desc) lines.push(`   ${c.desc}`);
    }
    lines.push("");
  }

  lines.push(DIV);
  if (footer) lines.push(`⚠ ${footer}`);
  return lines.join("\n");
}

// ─── SECTIONS ────────────────────────────────────────────────

/**
 * Wrapped section — for long-form content
 */
function section(text) {
  return `╔${"═".repeat(29)}╗\n${text}\n╚${"═".repeat(29)}╝`;
}

/**
 * Simple boxed text — for quick highlights
 */
function box(text) {
  return `「 ${text} 」`;
}

/**
 * Tag/badge — inline highlight
 */
function tag(text, emoji = "") {
  const e = emoji ? `${emoji} ` : "";
  return `_${e}${text}_`;
}

// ─── QUICK FORMATTERS ────────────────────────────────────────

/**
 * Stats row — for compact stat display
 * 🗡️ ATK: 45  |  🛡️ DEF: 30  |  ❤️ HP: 100
 */
function statsRow(items) {
  return items.map(s => {
    const e = s.emoji || "";
    return `${e} *${s.label}*: ${s.value}`;
  }).join("  │  ");
}

/**
 * Stat bar — visual progress bar
 * `██████████░░░░░░░░░░` 65/100 *(65%)*
 */
function statBar(current, max, length = 10) {
  const filled = Math.round((current / max) * length);
  const empty = length - filled;
  const pct = Math.round((current / max) * 100);
  return `\`█${"█".repeat(Math.max(0, filled - 1))}${"░".repeat(empty)}\` ${current}/${max} *(${pct}%)*`;
}

module.exports = {
  DIV,
  DIV_SHORT,
  header,
  subheader,
  divider,
  card,
  choiceList,
  section,
  box,
  tag,
  statsRow,
  statBar,
};
