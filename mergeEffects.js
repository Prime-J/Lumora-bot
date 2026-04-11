const fs = require("fs");

// Load files
const items = JSON.parse(fs.readFileSync("./data/items.json", "utf-8"));
const effects = JSON.parse(fs.readFileSync("./data/effects.json", "utf-8"));

// Merge
for (const id in items) {
  if (effects[id]) {
    items[id].effects = effects[id];
  }
}

// Save updated file
fs.writeFileSync("./items.json", JSON.stringify(items, null, 2));

console.log("✅ Effects merged into items.json successfully!");