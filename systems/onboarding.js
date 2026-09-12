// ══════════════════════════════════════════════════════════════
// LUMORA ONBOARDING SYSTEM — Guided new-player registration
// ══════════════════════════════════════════════════════════════
// Star walks each new player through registration step by step.
// Steps: username → gender → age → icon → faction → mora → DONE
//
// Users must use command prefixes while being guided:
// .username <name>  →  .gender <male/female/other>  →  .age <number>  →  .icon

const ui = require("./ui");

const STEPS = ["username", "gender", "age", "birthday", "icon", "faction"];

// ─── Star's messages for each step ───────────────────────────

function stepMessage(step, data) {
  const name = data?.username || "Lumorian";

  switch (step) {
    case "username":
      return [
        ui.header("REGISTER", "✨"),
        "",
        ui.subheader("YOUR IDENTITY", "🎭"),
        "",
        "Every legend starts with a name.",
        "What should the world call you?",
        "",
        ui.card("SETUP", "📝", [
          { emoji: "👤", label: "Command", value: `.username <name>` },
          { emoji: "📏", label: "Limit", value: "2–20 characters" },
        ]),
        "",
        `_Example: ${".username"} Prime_`,
      ].join("\n");

    case "gender":
      return [
        ui.header("IDENTITY", "🎭"),
        "",
        `💫 *${name}!* I like that.`,
        "",
        "What are you?",
        "",
        ui.card("CHOOSE ONE", "🎯", [
          { emoji: "♂", label: "Male", value: ".gender male" },
          { emoji: "♀", label: "Female", value: ".gender female" },
          { emoji: "🙁", label: "Rather not say", value: ".gender rather not say" },
        ]),
        "",
        `_Or type ${".gender"} male / female / rather not say_ 👇_`,
      ].join("\n");

    case "age":
      return [
        ui.header("DETAILS", "📋"),
        "",
        ui.card("SETUP", "📝", [
          { emoji: "👤", label: "Command", value: `.age <number>` },
          { emoji: "📏", label: "Range", value: "10–99" },
        ]),
        "",
        `_Example: ${".age"} 18_`,
      ].join("\n");

    case "birthday":
      return [
        ui.header("BIRTHDAY", "🎂"),
        "",
        `When's your special day, *${name}*?`,
        "",
        ui.card("SETUP", "📝", [
          { emoji: "📅", label: "Command", value: `.birthday DD/MM` },
          { emoji: "📏", label: "Format", value: "e.g. 15/03" },
        ]),
        "",
        `_Example: ${".birthday"} 15/03_`,
        `_Type ${".skip-birthday"} to skip 👇_`,
      ].join("\n");

    case "icon":
      return [
        ui.header("ICON", "📸"),
        "",
        `Almost there, *${name}*!`,
        "",
        "Send me your *profile icon* —",
        "a photo or avatar that represents you.",
        "",
        ui.card("OPTIONS", "🎯", [
          { emoji: "📸", label: "Send", value: "an image directly" },
          { emoji: "⏭️", label: "Skip", value: `.skip-icon` },
        ]),
        "",
        `_Or type ${".skip-icon"} to skip 👇_`,
      ].join("\n");

    case "faction":
      return [
        ui.header("CHOOSE YOUR PATH", "⚔️"),
        "",
        `${name}, the world of Lumora`,
        "is divided into *three factions*.",
        "",
        "Each one has its own beliefs,",
        "strengths, and allies.",
        "",
        ui.divider(),
        "⚠️ _Your faction will shape",
        "your journey through Lumora._",
        "",
        `_Tap a button or type: ${".faction"} harmony / purity / rift_`,
      ].join("\n");

    case "complete":
      return [
        ui.header("G A M E  B E G I N S", "🎆"),
        "",
        `Welcome to *Lumora*, *${name}*!`,
        "",
        "Your journey starts now.",
        "",
        ui.card("QUICK START", "🎮", [
          { emoji: "👤", label: ".profile", value: "View your stats" },
          { emoji: "⚔️", label: ".battle @", value: "PvP battle" },
          { emoji: "🔍", label: ".hunt", value: "Wild Mora" },
          { emoji: "🗺️", label: ".map", value: "Explore" },
          { emoji: "🛒", label: ".market", value: "Shop" },
          { emoji: "📋", label: ".help", value: "All commands" },
        ]),
        "",
        "_The Rift is watching... good luck._ 🕶️",
      ].join("\n");

    default:
      return "";
  }
}

// ─── Validation per step ─────────────────────────────────────

function validate(step, input) {
  switch (step) {
    case "username": {
      // Strip command prefix if present
      let raw = String(input || "").trim();
      if (raw.toLowerCase().startsWith(".username")) {
        raw = raw.slice(9).trim();
      }
      if (!raw) return { ok: false, err: "❌ You didn't type anything! What's your name?" };
      if (raw.length < 2) return { ok: false, err: "❌ Too short! At least *2 characters*." };
      if (raw.length > 20) return { ok: false, err: "❌ Too long! Max *20 characters*." };
      if (/[<>{}|\\]/.test(raw))
        return { ok: false, err: "❌ No special characters like <, >, {, }." };
      return { ok: true, value: raw };
    }

    case "gender": {
      // Strip command prefix if present
      let g = String(input || "").trim().toLowerCase();
      if (g.startsWith(".gender")) {
        g = g.slice(7).trim();
      }
      const map = {
        male: "Male", m: "Male",
        female: "Female", f: "Female",
        other: "Rather not say", o: "Rather not say",
        "1": "Male",
        "2": "Female",
        "3": "Rather not say",
      };
      if (!map[g])
        return {
          ok: false,
          err: "❌ Choose: *male*, *female*, or *rather not say*\n\n_Or tap a button above 👆_",
        };
      return { ok: true, value: map[g] };
    }

    case "age": {
      // Strip command prefix if present
      let n = String(input || "").trim();
      if (n.toLowerCase().startsWith(".age")) {
        n = n.slice(4).trim();
      }
      const age = parseInt(n, 10);
      if (isNaN(age) || age < 10 || age > 99)
        return { ok: false, err: "❌ Enter a valid age (*10–99*)." };
      return { ok: true, value: age };
    }

    case "birthday": {
      let b = String(input || "").trim();
      if (b.toLowerCase().startsWith(".birthday")) b = b.slice(9).trim();
      const parts = b.split("/");
      if (parts.length !== 2) return { ok: false, err: "❌ Use format *DD/MM* (e.g. 15/03)" };
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12)
        return { ok: false, err: "❌ Invalid date. Day: 1-31, Month: 1-12" };
      return { ok: true, value: `${day}/${month}` };
    }

    case "icon":
      // Icon validated separately (image detection in index.js)
      return { ok: true, value: input };

    case "faction": {
      // Strip command prefix if present
      let f = String(input || "").trim().toLowerCase();
      if (f.startsWith(".faction")) {
        f = f.slice(8).trim();
      }
      if (!["harmony", "purity", "rift"].includes(f))
        return {
          ok: false,
          err: "❌ Choose: *harmony*, *purity*, or *rift*",
        };
      return { ok: true, value: f };
    }

    default:
      return { ok: true, value: input };
  }
}

// ─── State helpers ───────────────────────────────────────────

function getNextStep(current) {
  const idx = STEPS.indexOf(current);
  return idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
}

function isActive(player) {
  return player && typeof player.onboardingStep === "string" && player.onboardingStep !== "done";
}

module.exports = {
  STEPS,
  stepMessage,
  validate,
  getNextStep,
  isActive,
};
