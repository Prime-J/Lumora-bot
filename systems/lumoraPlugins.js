"use strict";
// ╔═══════════════════════════════════════════════════════════════════╗
// ║  LUMORA UI PLUGIN LOADER                                          ║
// ╠═══════════════════════════════════════════════════════════════════╣
// ║  Each Lumora UI screen is its own plugin file in plugins/lumora/  ║
// ║  , written in the same format as the working dino.js plugin:      ║
// ║      export default { name, command, category, description, run } ║
// ║                                                                   ║
// ║  .mjs keeps the ESM plugin format while the bot itself stays CJS. ║
// ║  A plugin that throws is isolated here — it never kills the bot.  ║
// ╚═══════════════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const PLUGIN_DIR = path.join(__dirname, "..", "plugins", "lumora");

let cache = null;

/** Every usable plugin in plugins/lumora/, loaded once per process. */
async function loadPlugins() {
  if (cache) return cache;

  let files = [];
  try {
    files = fs.readdirSync(PLUGIN_DIR).filter((f) => f.endsWith(".mjs")).sort();
  } catch (e) {
    console.log("[lumora-ui] no plugin folder yet:", e.message);
    cache = [];
    return cache;
  }

  const plugins = [];
  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(path.join(PLUGIN_DIR, file)).href);
      const plugin = mod.default || mod;
      if (!plugin || typeof plugin.run !== "function" || !Array.isArray(plugin.command)) {
        console.log("[lumora-ui] skipped", file, "— bad plugin shape");
        continue;
      }
      plugins.push(Object.assign({}, plugin, { file }));
    } catch (e) {
      console.log("[lumora-ui] failed to load", file, "—", e && e.message);
    }
  }

  cache = plugins;
  return cache;
}

/** Does this command belong to a Lumora UI plugin? */
async function match(command) {
  const plugins = await loadPlugins();
  const cmd = String(command || "").toLowerCase();
  return plugins.find((p) => p.command.indexOf(cmd) !== -1 || p.name === cmd) || null;
}

/**
 * Run the matching plugin, if any.
 * @returns {Promise<boolean>} false when nothing matched OR the plugin
 * declined by returning false (text-UI mode, or a sub-command it does not
 * own) — index.js then lets the ordinary text command handle it.
 */
async function dispatch(command, ctx) {
  const plugin = await match(command);
  if (!plugin) return false;
  const res = await plugin.run(ctx);
  return res !== false;
}

/** For the help/menu system later on. */
async function list() {
  const plugins = await loadPlugins();
  return plugins.map((p) => ({
    name: p.name,
    command: p.command,
    description: p.description || "",
    file: p.file,
  }));
}

module.exports = { dispatch, match, list, loadPlugins, PLUGIN_DIR };
