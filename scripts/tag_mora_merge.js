// One-off tagger: seed `merge` flags across data/mora.json.
// Heuristic — legendary = "full", everything else = "partial".
// Designer can override per-entry later (and mark some non-mergeable).
//
// Idempotent: skips entries that already have a `merge` field.
//
// Usage:  node scripts/tag_mora_merge.js
"use strict";

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "mora.json");
const data = JSON.parse(fs.readFileSync(file, "utf-8"));

let tagged = 0;
let preserved = 0;

for (const mora of data) {
  if ("merge" in mora) { preserved++; continue; }

  const rarity = String(mora.rarity || "").toLowerCase();

  // Insert in a canonical position: right after `rarity` field, preserving
  // surrounding key order via object rebuild.
  const rebuilt = {};
  for (const [k, v] of Object.entries(mora)) {
    rebuilt[k] = v;
    if (k === "rarity") {
      rebuilt.merge = rarity === "legendary" ? "full" : "partial";
    }
  }
  // Mutate in place
  for (const k of Object.keys(mora)) delete mora[k];
  Object.assign(mora, rebuilt);
  tagged++;
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(`Tagged: ${tagged}, preserved (already had merge): ${preserved}, total: ${data.length}`);
