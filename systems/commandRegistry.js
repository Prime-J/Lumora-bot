"use strict";
// ═══════════════════════════════════════════════════════════════
// LUMORA COMMAND REGISTRY — Complete
// Every command in index.js, with metadata for the help system.
// Auto-validate with: node -e "require('./systems/commandRegistry').validate()"
// ═══════════════════════════════════════════════════════════════

const COMMANDS = [

  // ═══════════════════════════════════════════════════════════════
  // 🎮 GAME MENU
  // ═══════════════════════════════════════════════════════════════

  // ── 🌌 Core ──
  { name: "profile",     aliases: ["pro"],           category: "game", subcat: "core",       desc: "View your stats, rank & progression",        usage: ".profile" },
  { name: "stats",       aliases: ["stat"],          category: "game", subcat: "core",       desc: "View stat distribution & invest points",      usage: ".stats" },
  { name: "invest",      aliases: [],                category: "game", subcat: "core",       desc: "Allocate stat points to an attribute",        usage: ".invest strength 3" },
  { name: "rank",        aliases: [],                category: "game", subcat: "core",       desc: "Your rank card (image)",                      usage: ".rank" },
  { name: "ranks",       aliases: [],                category: "game", subcat: "core",       desc: "Full rank ladder",                            usage: ".ranks" },
  { name: "gear",        aliases: [],                category: "game", subcat: "core",       desc: "View equipped loadout",                       usage: ".gear" },
  { name: "equip",       aliases: ["equip-achievement"], category: "game", subcat: "core",       desc: "Equip an item or achievement title",         usage: ".equip Iron Sword" },
  { name: "unequip",     aliases: ["unequip-achievement"], category: "game", subcat: "core",       desc: "Remove gear or achievement title",           usage: ".unequip weapon" },
  { name: "eradicate",   aliases: [],                category: "game", subcat: "core",       desc: "Destroy an item permanently",                 usage: ".eradicate item" },
  { name: "styles",      aliases: ["style"],         category: "game", subcat: "core",       desc: "Browse all fighting styles",                  usage: ".styles" },
  { name: "equipstyle",  aliases: ["equip-style"],   category: "game", subcat: "core",       desc: "Switch your active fighting style",           usage: ".equipstyle Wind Step" },
  { name: "heal",        aliases: [],                category: "game", subcat: "core",       desc: "Heal all your Mora",                          usage: ".heal" },
  { name: "set-username",aliases: ["username","name"],category: "game", subcat: "core",      desc: "Set your display name",                       usage: ".set-username Prime" },
  { name: "begin",       aliases: [],                category: "game", subcat: "core",       desc: "Start your Lumora journey",                   usage: ".begin" },
  { name: "register",    aliases: [],                category: "game", subcat: "core",       desc: "Register your character",                     usage: ".register" },
  { name: "choose",      aliases: [],                category: "game", subcat: "core",       desc: "Pick your starter Mora",                      usage: ".choose" },
  { name: "start",       aliases: [],                category: "game", subcat: "core",       desc: "Awaken (old command, use .begin instead)",    usage: ".start" },
  { name: "set-icon",    aliases: ["icon","seticon"], category: "game", subcat: "core",      desc: "Set your profile icon",                       usage: ".set-icon 5" },
  { name: "gender",      aliases: [],                category: "game", subcat: "core",       desc: "Set your gender",                             usage: ".gender male" },
  { name: "bio",         aliases: [],                category: "game", subcat: "core",       desc: "Set your profile bio",                        usage: ".bio I am thechosen one" },
  { name: "birthday",    aliases: ["bday"],          category: "game", subcat: "core",       desc: "Set your birthday (DD/MM)",                   usage: ".birthday 15/03" },
  { name: "reset-stats", aliases: [],                category: "game", subcat: "core",       desc: "Reset stat distribution",                     usage: ".reset-stats" },
  { name: "shardstorage",aliases: ["storage"],       category: "game", subcat: "core",       desc: "Inspect per-Mora vault caps",                 usage: ".shardstorage" },
  { name: "use",         aliases: [],                category: "game", subcat: "core",       desc: "Use an item or ability",                      usage: ".use item" },

  // ── 🐾 Mora ──
  { name: "mora",        aliases: [],                category: "game", subcat: "mora",       desc: "Browse all Mora data & lore",                 usage: ".mora" },
  { name: "tamed",       aliases: ["t2tamed"],       category: "game", subcat: "mora",       desc: "Your captured Mora collection",               usage: ".tamed" },
  { name: "tame",        aliases: [],                category: "game", subcat: "mora",       desc: "Bond with a defeated wild Mora",              usage: ".tame" },
  { name: "release",     aliases: [],                category: "game", subcat: "mora",       desc: "Free a Mora (+Intelligence)",                 usage: ".release" },
  { name: "sanctuary",   aliases: ["sanctuary-view","viewsanctuary","view-sanctuary"], category: "game", subcat: "mora", desc: "Shelter a Mora or view sanctuary",  usage: ".sanctuary" },
  { name: "companion",   aliases: [],                category: "game", subcat: "mora",       desc: "Set or view your companion Mora",             usage: ".companion Thornel" },
  { name: "switch",      aliases: [],                category: "game", subcat: "mora",       desc: "Switch active companion",                     usage: ".switch" },
  { name: "mutate",      aliases: [],                category: "game", subcat: "mora",       desc: "Trigger Mora mutation",                       usage: ".mutate Thornel" },
  { name: "tamed-give",  aliases: ["t2party"],       category: "game", subcat: "mora",       desc: "Trade a Mora to another player",              usage: ".tamed-give @user" },
  { name: "tsearch",     aliases: ["tamed-search"],  category: "game", subcat: "mora",       desc: "Find owned Mora by name",                     usage: ".tsearch Thornel" },
  { name: "catch",       aliases: ["c"],             category: "game", subcat: "mora",       desc: "Catch a spawned Mora",                        usage: ".catch" },

  // ── 💎 Shards & Styles ──
  { name: "shards",      aliases: ["shard"],         category: "game", subcat: "shards",     desc: "Your shard vault",                            usage: ".shards" },
  { name: "equipshard",  aliases: ["awaken","equip-shard"], category: "game", subcat: "shards", desc: "Awaken a shard (become the Mora)",    usage: ".awaken Fire Shard" },
  { name: "shed",        aliases: [],                category: "game", subcat: "shards",     desc: "Revert to base form",                         usage: ".shed" },
  { name: "trade",       aliases: [],                category: "game", subcat: "shards",     desc: "Swap shards with a player (10m TTL)",         usage: ".trade @user A B" },
  { name: "purify",      aliases: [],                category: "game", subcat: "shards",     desc: "Cleanse corrupted shard",                     usage: ".purify Dark Shard" },
  { name: "destroy",     aliases: [],                category: "game", subcat: "shards",     desc: "Shatter corrupted shard (+Resonance)",        usage: ".destroy Dark Shard" },
  { name: "merge",       aliases: [],                category: "game", subcat: "shards",     desc: "Merge two shards into a higher tier",         usage: ".merge shard1 shard2" },
  { name: "unmerge",     aliases: [],                category: "game", subcat: "shards",     desc: "Split a merged shard back",                   usage: ".unmerge shard" },
  { name: "choosestyle", aliases: ["choose-style"],  category: "game", subcat: "shards",     desc: "Pick starter fighting style",                 usage: ".choosestyle 1" },
  { name: "chooseshard", aliases: ["choose-shard"],  category: "game", subcat: "shards",     desc: "Pick starter shard",                          usage: ".chooseshard 1" },

  // ── ⚔️ Combat ──
  { name: "attack",      aliases: [],                category: "game", subcat: "combat",     desc: "Fire a move in battle",                       usage: ".attack 1" },
  { name: "charge",      aliases: ["e-charge","energy"], category: "game", subcat: "combat",  desc: "Regen combat energy (spend turn)",            usage: ".charge" },
  { name: "battle",      aliases: [],                category: "game", subcat: "combat",     desc: "Challenge a player to PvP",                   usage: ".battle @user" },
  { name: "accept",      aliases: [],                category: "game", subcat: "combat",     desc: "Accept a PvP challenge",                      usage: ".accept" },
  { name: "reject",      aliases: [],                category: "game", subcat: "combat",     desc: "Reject a PvP challenge",                      usage: ".reject" },
  { name: "forfeit",     aliases: [],                category: "game", subcat: "combat",     desc: "Surrender in battle",                         usage: ".forfeit" },
  { name: "challenge",   aliases: ["npc"],           category: "game", subcat: "combat",     desc: "Fight an NPC in the arena",                   usage: ".challenge Goblin weak" },
  { name: "arena",       aliases: [],                category: "game", subcat: "combat",     desc: "View arena tiers & NPCs",                     usage: ".arena" },
  { name: "arena-flee",  aliases: [],                category: "game", subcat: "combat",     desc: "Abandon arena battle",                        usage: ".arena-flee" },
  { name: "execute",     aliases: [],                category: "game", subcat: "combat",     desc: "Purity: execute defeated Mora",               usage: ".execute" },
  { name: "conscript",   aliases: [],                category: "game", subcat: "combat",     desc: "Purity: conscript defeated Mora",             usage: ".conscript" },
  { name: "fortify",     aliases: [],                category: "game", subcat: "combat",     desc: "Purity: fortify with defeated Mora",          usage: ".fortify" },
  { name: "devour",      aliases: [],                category: "game", subcat: "combat",     desc: "Rift: devour defeated Mora",                  usage: ".devour" },
  { name: "bind",        aliases: [],                category: "game", subcat: "combat",     desc: "Rift: bind defeated Mora",                    usage: ".bind" },
  { name: "harvest",     aliases: [],                category: "game", subcat: "combat",     desc: "Rift: harvest defeated Mora",                 usage: ".harvest" },

  // ── 🗺️ World ──
  { name: "map",         aliases: [],                category: "game", subcat: "world",      desc: "Open the world map",                          usage: ".map" },
  { name: "travel",      aliases: [],                category: "game", subcat: "world",      desc: "Travel to a terrain",                         usage: ".travel forest normal" },
  { name: "proceed",     aliases: [],                category: "game", subcat: "world",      desc: "Confirm travel to terrain",                   usage: ".proceed" },
  { name: "dismiss",     aliases: [],                category: "game", subcat: "world",      desc: "Cancel travel",                               usage: ".dismiss" },
  { name: "return",      aliases: [],                category: "game", subcat: "world",      desc: "Head back to Capital",                        usage: ".return" },
  { name: "hunt",        aliases: ["owner-hunt"],    category: "game", subcat: "world",      desc: "Scout for wild Mora encounters",              usage: ".hunt" },
  { name: "track",       aliases: [],                category: "game", subcat: "world",      desc: "Follow mysterious tracks",                    usage: ".track" },
  { name: "pick",        aliases: [],                category: "game", subcat: "world",      desc: "Pick up loot after a hunt",                   usage: ".pick" },
  { name: "pass",        aliases: [],                category: "game", subcat: "world",      desc: "Leave loot behind",                           usage: ".pass" },
  { name: "journal",     aliases: [],                category: "game", subcat: "world",      desc: "Hunt history & streak",                       usage: ".journal" },
  { name: "bounty",      aliases: [],                category: "game", subcat: "world",      desc: "Today's bounty target",                       usage: ".bounty" },
  { name: "assemble",    aliases: [],                category: "game", subcat: "world",      desc: "Forge Rift Relic (5 frags)",                  usage: ".assemble" },
  { name: "lastterrain", aliases: [],                category: "game", subcat: "world",      desc: "Last 3 terrains visited",                     usage: ".lastterrain" },
  { name: "intel",       aliases: ["gather"],        category: "game", subcat: "world",      desc: "NPC dossier or faction intel",                usage: ".intel Goblin" },
  { name: "joined",      aliases: [],                category: "game", subcat: "world",      desc: "See who joined recently",                     usage: ".joined" },

  // ── ⚔️ Factions ──
  { name: "faction",     aliases: ["factioninfo"],   category: "game", subcat: "factions",   desc: "View faction info & perks",                   usage: ".faction harmony" },
  { name: "fbuy",        aliases: [],                category: "game", subcat: "factions",   desc: "Buy faction-exclusive gear",                  usage: ".fbuy item" },
  { name: "missions",    aliases: [],                category: "game", subcat: "factions",   desc: "View weekly faction missions",                usage: ".missions" },
  { name: "complete",    aliases: [],                category: "game", subcat: "factions",   desc: "Claim mission reward",                        usage: ".complete ID" },
  { name: "facpoints",   aliases: ["factionpoints"], category: "game", subcat: "factions",   desc: "Faction point standings",                     usage: ".facpoints" },
  { name: "facprogress", aliases: ["factionprogress"],category: "game", subcat: "factions",  desc: "Season graph (200L)",                         usage: ".facprogress" },
  { name: "fortify-wall",aliases: ["fortifywall"],   category: "game", subcat: "factions",   desc: "Donate crystals to reinforce wall",           usage: ".fortify-wall 5" },
  { name: "upgrade-wall",aliases: ["upgradewall"],   category: "game", subcat: "factions",   desc: "Spend treasury to level up wall",             usage: ".upgrade-wall" },
  { name: "donate",      aliases: [],                category: "game", subcat: "factions",   desc: "Feed faction treasury",                       usage: ".donate 100" },
  { name: "submit-mora", aliases: [],                category: "game", subcat: "factions",   desc: "Deploy Mora to treasury",                     usage: ".submit-mora name" },
  { name: "pe-check",    aliases: ["pecheck"],       category: "game", subcat: "factions",   desc: "Primordial Energy levels",                    usage: ".pe-check" },
  { name: "war",         aliases: ["war-start"],     category: "game", subcat: "factions",   desc: "Join/view faction war bracket",               usage: ".war join" },
  { name: "ready",       aliases: [],                category: "game", subcat: "factions",   desc: "Ready up for war match",                      usage: ".ready" },
  { name: "withdraw",    aliases: [],                category: "game", subcat: "factions",   desc: "Leave war (penalties!)",                      usage: ".withdraw" },
  { name: "f-lb",        aliases: ["wealthlb"],      category: "game", subcat: "factions",   desc: "Resonance leaderboard",                       usage: ".f-lb" },
  { name: "fix-faction", aliases: ["set-faction","setfaction"], category: "game", subcat: "factions", desc: "Set a player's faction (admin)", usage: ".fix-faction @user harmony" },

  // ── 🌀 Raids ──
  { name: "summonkael",  aliases: ["summon-kael","summon-merchant"],   category: "game", subcat: "raids",      desc: "Summon the Riftwalker or merchant",         usage: ".summonkael" },
  { name: "claim-contract",aliases: ["claim-raidcontract","claimraidcontract"], category: "game", subcat: "raids", desc: "Bind Kael's contract", usage: ".claim-contract" },
  { name: "raid",        aliases: ["raidstatus","raid-status"], category: "game", subcat: "raids", desc: "Join or view an ongoing raid",       usage: ".raid join" },
  { name: "engage",      aliases: ["raid-engage","raidengage"], category: "game", subcat: "raids", desc: "Intercept a raider (PvP)",          usage: ".engage @raider" },
  { name: "escape",      aliases: ["raid-escape","raidescape"], category: "game", subcat: "raids", desc: "Use Rift Escape Shard to break free", usage: ".escape" },
  { name: "raidattack",  aliases: ["raid-attack"],   category: "game", subcat: "raids",      desc: "Strike wall / fight treasury Mora",           usage: ".raidattack" },
  { name: "raidreinforce",aliases: ["raid-reinforce"], category: "game", subcat: "raids",    desc: "Defender: restore wall HP",                    usage: ".raidreinforce" },
  { name: "raidgo",      aliases: ["raid-go","raidend","raid-end"],       category: "game", subcat: "raids",      desc: "Leader: force-start or end raid",            usage: ".raidgo" },
  { name: "raidkick",    aliases: ["raid-kick"],     category: "game", subcat: "raids",      desc: "Leader: remove unready raider",               usage: ".raidkick @user" },
  { name: "respond",     aliases: [],                category: "game", subcat: "raids",      desc: "Name Kael's target faction",                  usage: ".respond harmony" },
  { name: "refuse",      aliases: [],                category: "game", subcat: "raids",      desc: "Refuse a raid contract",                      usage: ".refuse" },
  { name: "rerollroles", aliases: ["reroll-roles"],  category: "game", subcat: "raids",      desc: "Leader: reroll roles (max 2)",                usage: ".rerollroles" },

  // ── 💰 Economy ──
  { name: "market",      aliases: ["owner-market"],  category: "game", subcat: "economy",    desc: "Browse the item shop",                        usage: ".market" },
  { name: "buy",         aliases: [],                category: "game", subcat: "economy",    desc: "Purchase an item",                            usage: ".buy item" },
  { name: "daily",       aliases: [],                category: "game", subcat: "economy",    desc: "Daily Lucons + streak bonus",                 usage: ".daily" },
  { name: "weekly",      aliases: [],                category: "game", subcat: "economy",    desc: "Weekly Lucons (faction taxed)",               usage: ".weekly" },
  { name: "give",        aliases: [],                category: "game", subcat: "economy",    desc: "Send Lucons to a player",                     usage: ".give @user 100" },
  { name: "transfer-lcr",aliases: [],                category: "game", subcat: "economy",    desc: "Send Lucrystals",                             usage: ".transfer-lcr @user 5" },
  { name: "transfer-reob",aliases: [],               category: "game", subcat: "economy",    desc: "Send Rift Energy Orbs",                       usage: ".transfer-reob @user 5" },
  { name: "reverse",     aliases: [],                category: "game", subcat: "economy",    desc: "Undo a Lucons transaction",                   usage: ".reverse CODE" },
  { name: "bank",        aliases: ["main-bank","mainbank"], category: "game", subcat: "economy", desc: "View your vault or Alverah's storefront", usage: ".bank" },
  { name: "wealth",      aliases: [],                category: "game", subcat: "economy",    desc: "Wealth ledger card",                          usage: ".wealth" },
  { name: "rob",         aliases: ["snatch"],        category: "game", subcat: "economy",    desc: "Snatch Lucons (needs glove)",                 usage: ".rob @user" },
  { name: "defend",      aliases: [],                category: "game", subcat: "economy",    desc: "React to a snatch attempt",                   usage: ".defend" },
  { name: "mask",        aliases: ["unmask"],        category: "game", subcat: "economy",    desc: "Hide/show your profile (Veil Mask)",          usage: ".mask" },
  { name: "pbuy",        aliases: [],                category: "game", subcat: "economy",    desc: "Buy from Pro Lucrystal shop",                 usage: ".pbuy item" },
  { name: "black-market",aliases: [],                category: "game", subcat: "economy",    desc: "Browse forbidden items (Pro)",                usage: ".black-market" },
  { name: "buy-bm",      aliases: [],                category: "game", subcat: "economy",    desc: "Buy from void shop (Pro)",                    usage: ".buy-bm item" },
  { name: "exchange",    aliases: [],                category: "game", subcat: "economy",    desc: "1000 Lucons → 1 Lucrystal",                   usage: ".exchange 1000" },
  { name: "gitem",       aliases: [],                category: "game", subcat: "economy",    desc: "Give items to a player",                      usage: ".gitem item 5 @user" },
  { name: "consume",     aliases: [],                category: "game", subcat: "economy",    desc: "Use a consumable item",                       usage: ".consume Health Potion" },
  { name: "refill",      aliases: [],                category: "game", subcat: "economy",    desc: "Refill Pro hunt energy",                      usage: ".refill" },

  // ── 🎒 Inventory ──
  { name: "inv",         aliases: ["inventory"],     category: "game", subcat: "inventory",  desc: "View your items",                             usage: ".inv" },
  { name: "item",        aliases: [],                category: "game", subcat: "inventory",  desc: "View item details",                           usage: ".item Iron Sword" },
  { name: "scrolls",     aliases: [],                category: "game", subcat: "inventory",  desc: "Your scroll inventory",                       usage: ".scrolls" },
  { name: "open",        aliases: [],                category: "game", subcat: "inventory",  desc: "Open a scroll (DMs quest details)",            usage: ".open War Scroll" },

  // ── 🏆 Rankings ──
  { name: "lb",          aliases: ["leaderboard"],   category: "game", subcat: "rankings",   desc: "Global leaderboard",                          usage: ".lb" },
  { name: "wealth-lb",   aliases: ["wlb"],           category: "game", subcat: "rankings",   desc: "Top 10 richest players",                      usage: ".wealth-lb" },

  // ── 🎯 Quests & Progression ──
  { name: "quests",      aliases: ["quest"],         category: "game", subcat: "progression",desc: "View active quests",                           usage: ".quests" },
  { name: "whisper",     aliases: [],                category: "game", subcat: "progression",desc: "Speak to a quest NPC — your active quest tells you who to meet", usage: ".whisper npc" },
  { name: "claim-ref",   aliases: [],                category: "game", subcat: "progression",desc: "Claim referral reward",                        usage: ".claim-ref" },
  { name: "pick-ref",    aliases: [],                category: "game", subcat: "progression",desc: "Pick referral reward",                         usage: ".pick-ref choice" },
  { name: "myref",       aliases: [],                category: "game", subcat: "progression",desc: "Share your referral code",                     usage: ".myref" },
  { name: "claim-gift",  aliases: ["claimgift","gift","apology"], category: "game", subcat: "progression", desc: "Check/post-wipe gift status", usage: ".claim-gift" },
  { name: "gift-star",   aliases: [],                category: "game", subcat: "progression",desc: "Send a tribute to Prijo's house",              usage: ".gift-star 100" },
  { name: "achievements",aliases: ["titles"],        category: "game", subcat: "progression",desc: "View titles & achievements",                   usage: ".achievements" },
  { name: "chronicles",  aliases: ["lore"],          category: "game", subcat: "progression",desc: "The story of Lumora",                          usage: ".chronicles" },
  { name: "party",       aliases: [],                category: "game", subcat: "progression",desc: "Party management",                             usage: ".party" },

  // ── ⭐ Pro / Subscriptions ──
  { name: "pro",         aliases: ["pros"],          category: "game", subcat: "pro",        desc: "Your subscription status",                    usage: ".pro" },
  { name: "pro-info",    aliases: [],                category: "game", subcat: "pro",        desc: "Tier plans & USD pricing",                    usage: ".pro-info" },
  { name: "pro-daily",   aliases: [],                category: "game", subcat: "pro",        desc: "Daily Lucons bonus (Pro)",                    usage: ".pro-daily" },
  { name: "pro-market",  aliases: [],                category: "game", subcat: "pro",        desc: "Browse Lucrystal shop",                       usage: ".pro-market" },
  { name: "autocatch",   aliases: [],                category: "game", subcat: "pro",        desc: "Arm offline Mora catcher",                    usage: ".autocatch 5" },
  { name: "autocatch-log",aliases: [],               category: "game", subcat: "pro",        desc: "View Mora caught while away",                 usage: ".autocatch-log" },
  { name: "subscribe-market",aliases: [],            category: "game", subcat: "pro",        desc: "Market notifications ON",                     usage: ".subscribe-market" },
  { name: "unsubscribe-market",aliases: [],          category: "game", subcat: "pro",        desc: "Market notifications OFF",                    usage: ".unsubscribe-market" },

  // ── 🧪 Mora Creation (Owner) ──
  { name: "create-mora", aliases: ["createmora","cmora"], category: "game", subcat: "creation", desc: "Forge a new Mora (costs Creation Powder)", usage: ".create-mora" },
  { name: "creations",   aliases: [],                category: "game", subcat: "creation",   desc: "List pending Mora submissions",               usage: ".creations" },
  { name: "approve-mora",aliases: ["approvemora"],   category: "game", subcat: "creation",   desc: "Approve a Mora submission",                   usage: ".approve-mora ID 5 lucons" },
  { name: "reject-mora", aliases: ["rejectmora"],    category: "game", subcat: "creation",   desc: "Reject a Mora submission",                    usage: ".reject-mora ID" },
  { name: "cancel-create",aliases: ["cancelcreate"], category: "game", subcat: "creation",   desc: "Cancel Mora creation in progress",            usage: ".cancel-create" },

  // ── 🏦 Bank Owner ──
  { name: "bank-register",aliases: [],               category: "game", subcat: "bank",       desc: "Open your vault",                             usage: ".bank register" },
  { name: "bank-info",   aliases: ["bankinfo","main-bank-info"], category: "game", subcat: "bank", desc: "Internal ledger (bank owner)",           usage: ".bank-info" },
  { name: "bank-tax",    aliases: ["banktax"],       category: "game", subcat: "bank",       desc: "Set deposit tax (bank owner)",                usage: ".bank-tax 5" },
  { name: "bank-pool",   aliases: ["bankpool"],      category: "game", subcat: "bank",       desc: "View bank pool (bank owner)",                 usage: ".bank-pool" },
  { name: "bank-grant",  aliases: ["bankgrant"],     category: "game", subcat: "bank",       desc: "Grant Lucons from pool (bank owner)",         usage: ".bank-grant @user 100" },
  { name: "bank-vault",  aliases: ["bankvault","vault-audit"], category: "game", subcat: "bank", desc: "Audit vault (bank owner)",              usage: ".bank-vault" },
  { name: "bank-assign", aliases: ["bankassign"],    category: "game", subcat: "bank",       desc: "Assign bank role (architect)",                usage: ".bank-assign @user" },
  { name: "bank-remove", aliases: ["bankremove","bank-dismiss"], category: "game", subcat: "bank", desc: "Remove bank role (architect)",          usage: ".bank-remove @user" },
  { name: "vault",       aliases: [],                category: "game", subcat: "bank",       desc: "View your vault contents",                    usage: ".vault" },

  // ═══════════════════════════════════════════════════════════════
  // 🛠️ BOT MENU
  // ═══════════════════════════════════════════════════════════════

  // ── 🎵 Media ──
  { name: "sticker",     aliases: ["s"],             category: "bot", subcat: "media",      desc: "Convert image → sticker",                     usage: ".sticker" },
  { name: "toimg",       aliases: [],                category: "bot", subcat: "media",      desc: "Convert sticker → image",                     usage: ".toimg" },
  { name: "q",           aliases: ["quote"],         category: "bot", subcat: "media",      desc: "Quote reply → sticker",                       usage: ".q" },
  { name: "artpic",      aliases: ["art","art-pack","artpack"], category: "bot", subcat: "media",     desc: "Fetch anime artwork",                         usage: ".artpic" },

  // ── 🎮 Entertainment ──
  { name: "8ball",       aliases: [],                category: "bot", subcat: "entertainment", desc: "Magic 8-ball — ask a question",              usage: ".8ball Will I win?" },
  { name: "flip",        aliases: ["coinflip"],      category: "bot", subcat: "entertainment", desc: "Coin flip",                                usage: ".flip" },
  { name: "roll",        aliases: ["dice"],          category: "bot", subcat: "entertainment", desc: "Dice roll",                                usage: ".roll 100" },
  { name: "ship",        aliases: [],                category: "bot", subcat: "entertainment", desc: "Love calculator",                          usage: ".ship @user" },
  { name: "rate",        aliases: [],                category: "bot", subcat: "entertainment", desc: "Rate anything",                            usage: ".rate this game" },
  { name: "roast",       aliases: [],                category: "bot", subcat: "entertainment", desc: "Roast someone",                            usage: ".roast @user" },
  { name: "truth",       aliases: [],                category: "bot", subcat: "entertainment", desc: "Truth or Dare — truth",                    usage: ".truth" },
  { name: "dare",        aliases: [],                category: "bot", subcat: "entertainment", desc: "Truth or Dare — dare",                     usage: ".dare" },

  // ── 🛠️ Utilities ──
  { name: "afk",         aliases: [],                category: "bot", subcat: "utility",    desc: "Set AFK status",                             usage: ".afk sleeping" },
  { name: "link",        aliases: [],                category: "bot", subcat: "utility",    desc: "Get group invite link",                       usage: ".link" },
  { name: "rules",       aliases: [],                category: "bot", subcat: "utility",    desc: "View group rules",                           usage: ".rules" },
  { name: "bug-report",  aliases: ["bug"],           category: "bot", subcat: "utility",    desc: "Report a bug",                               usage: ".bug-report desc" },
  { name: "appeal",      aliases: [],                category: "bot", subcat: "utility",    desc: "Request review of a punishment",             usage: ".appeal" },
  { name: "tutorial",    aliases: ["guide"],         category: "bot", subcat: "utility",    desc: "In-game tutorial guide",                     usage: ".tutorial" },
  { name: "tips",        aliases: ["tip"],           category: "bot", subcat: "utility",    desc: "Random gameplay tip",                        usage: ".tips" },
  { name: "updates",     aliases: ["update","update-release","release-update"], category: "bot", subcat: "utility", desc: "Current + pending updates", usage: ".updates" },
  { name: "lumora",      aliases: [],                category: "bot", subcat: "utility",    desc: "Enter the world of Lumora",                  usage: ".lumora" },
  { name: "s-l-d",       aliases: ["setlinkdesc"],   category: "bot", subcat: "utility",    desc: "Set group link description",                 usage: ".s-l-d description" },
  { name: "meeting",     aliases: ["mnotes"],        category: "bot", subcat: "utility",    desc: "Meeting notes / bulletin",                   usage: ".meeting" },
  { name: "confirm",     aliases: [],                category: "bot", subcat: "utility",    desc: "Confirm a prompted action",                  usage: ".confirm" },
  { name: "cancel",      aliases: [],                category: "bot", subcat: "utility",    desc: "Cancel a prompted action",                   usage: ".cancel" },
  { name: "run",         aliases: [],                category: "bot", subcat: "utility",    desc: "Run/execute an action",                      usage: ".run" },
  { name: "bugs",        aliases: [],                category: "bot", subcat: "utility",    desc: "View bug reports",                           usage: ".bugs" },

  // ── 🤖 AI / Prijo ──
  { name: "star-on",     aliases: [],                category: "bot", subcat: "ai",         desc: "Enable Prijo in this group",                 usage: ".star-on" },
  { name: "star-off",    aliases: [],                category: "bot", subcat: "ai",         desc: "Dismiss Prijo in this group",                usage: ".star-off" },
  { name: "star-mode",   aliases: [],                category: "bot", subcat: "ai",         desc: "Set Prijo's access mode",                    usage: ".star-mode public" },
  { name: "star-stats",  aliases: [],                category: "bot", subcat: "ai",         desc: "Prijo usage & cost stats",                   usage: ".star-stats" },
  { name: "star-reset",  aliases: [],                category: "bot", subcat: "ai",         desc: "Wipe Prijo's memory of someone",             usage: ".star-reset @user" },
  { name: "star-ping",   aliases: [],                category: "bot", subcat: "ai",         desc: "Loneliness pings on/off",                    usage: ".star-ping on" },
  { name: "star-bestie", aliases: [],                category: "bot", subcat: "ai",         desc: "Mark/unmark a confidant",                    usage: ".star-bestie add @user" },
  { name: "orders",      aliases: [],                category: "bot", subcat: "ai",         desc: "List Prijo's standing orders",               usage: ".orders" },
  { name: "order-del",   aliases: [],                category: "bot", subcat: "ai",         desc: "Remove an order",                            usage: ".order-del ID" },

  // ── ℹ️ Info ──
  { name: "ping",        aliases: [],                category: "bot", subcat: "info",       desc: "Test bot response",                          usage: ".ping" },
  { name: "uptime",      aliases: [],                category: "bot", subcat: "info",       desc: "Bot uptime",                                 usage: ".uptime" },
  { name: "players",     aliases: [],                category: "bot", subcat: "info",       desc: "Total registered players",                   usage: ".players" },
  { name: "menu",        aliases: [],                category: "bot", subcat: "info",       desc: "Quick action menu (→ help)",                  usage: ".menu" },
  { name: "help",        aliases: ["help-game","help-bot"], category: "bot", subcat: "info",  desc: "Help system — Game Menu & Bot Menu",          usage: ".help" },
  { name: "ow",          aliases: [],                category: "bot", subcat: "admin",      desc: "Owner override commands",                     usage: ".ow <command>" },
  { name: "warns",       aliases: [],                category: "bot", subcat: "info",       desc: "View warnings for a player",                 usage: ".warns @user" },
  { name: "punishinfo",  aliases: ["punishments"],   category: "bot", subcat: "info",       desc: "View punishment history",                    usage: ".punishinfo" },

  // ── 🛡️ Admin ──
  { name: "ban",         aliases: ["unban","autounban"], category: "bot", subcat: "admin",   desc: "Ban/unban a player",                          usage: ".ban @user" },
  { name: "warn",        aliases: ["unwarn"],        category: "bot", subcat: "admin",      desc: "Warn/unwarn a player",                        usage: ".warn @user" },
  { name: "punish",      aliases: ["p"],             category: "bot", subcat: "admin",      desc: "Punish a player",                             usage: ".punish @user" },
  { name: "forgive",     aliases: [],                category: "bot", subcat: "admin",      desc: "Forgive a punished player",                   usage: ".forgive @user" },
  { name: "promote",     aliases: [],                category: "bot", subcat: "admin",      desc: "Promote to group admin",                      usage: ".promote @user" },
  { name: "demote",      aliases: [],                category: "bot", subcat: "admin",      desc: "Demote from group admin",                     usage: ".demote @user" },
  { name: "kick",        aliases: ["remove"],        category: "bot", subcat: "admin",      desc: "Remove from group",                           usage: ".kick @user" },
  { name: "announce",    aliases: [],                category: "bot", subcat: "admin",      desc: "Send announcement",                           usage: ".announce message" },
  { name: "tagall",      aliases: [],                category: "bot", subcat: "admin",      desc: "Tag all group members",                       usage: ".tagall" },
  { name: "add-rule",    aliases: [],                category: "bot", subcat: "admin",      desc: "Add a group rule",                            usage: ".add-rule rule" },
  { name: "remove-rule", aliases: [],                category: "bot", subcat: "admin",      desc: "Remove a group rule",                         usage: ".remove-rule ID" },
  { name: "sudo",        aliases: ["sudos"],         category: "bot", subcat: "admin",      desc: "Manage sudos",                                usage: ".sudo @user" },
  { name: "unsudo",      aliases: [],                category: "bot", subcat: "admin",      desc: "Remove sudo",                                 usage: ".unsudo @user" },
  { name: "sudolist",    aliases: [],                category: "bot", subcat: "admin",      desc: "View hierarchy",                              usage: ".sudolist" },
  { name: "throne",      aliases: [],                category: "bot", subcat: "admin",      desc: "Set Right-Hand",                              usage: ".throne @user" },
  { name: "unthrone",    aliases: [],                category: "bot", subcat: "admin",      desc: "Remove Right-Hand",                           usage: ".unthrone @user" },
  { name: "pro-grant",   aliases: [],                category: "bot", subcat: "admin",      desc: "Subscribe a player",                          usage: ".pro-grant @user tier" },
  { name: "crystals",    aliases: [],                category: "bot", subcat: "admin",      desc: "Top up Lucrystals",                           usage: ".crystals @user 50" },
  { name: "give-orb",    aliases: ["giveorb"],       category: "bot", subcat: "admin",      desc: "Give Rift Energy Orbs",                       usage: ".give-orb @user 10" },
  { name: "addfacpts",   aliases: [],                category: "bot", subcat: "admin",      desc: "Add faction points",                          usage: ".addfacpts harmony 100" },
  { name: "setfacreward",aliases: [],                category: "bot", subcat: "admin",      desc: "Set faction war reward",                      usage: ".setfacreward 500" },
  { name: "setfacstyle", aliases: [],                category: "bot", subcat: "admin",      desc: "Set faction war style",                       usage: ".setfacstyle harmony" },
  { name: "endseason",   aliases: ["resetseason"],   category: "bot", subcat: "admin",      desc: "End/reset season",                            usage: ".endseason" },
  { name: "spawn-on",    aliases: ["spawnon"],       category: "bot", subcat: "admin",      desc: "Enable Mora spawning",                        usage: ".spawn-on" },
  { name: "spawn-off",   aliases: ["spawnoff"],      category: "bot", subcat: "admin",      desc: "Disable Mora spawning",                       usage: ".spawn-off" },
  { name: "spawn-status",aliases: ["spawnstatus"],   category: "bot", subcat: "admin",      desc: "View spawn status",                           usage: ".spawn-status" },
  { name: "spawnrates",  aliases: [],                category: "bot", subcat: "admin",      desc: "View/edit spawn rates",                       usage: ".spawnrates" },
  { name: "set-gauge",   aliases: [],                category: "bot", subcat: "admin",      desc: "Set spawn gauge",                             usage: ".set-gauge 50" },
  { name: "reduce-gauge",aliases: [],                category: "bot", subcat: "admin",      desc: "Reduce spawn gauge",                          usage: ".reduce-gauge 10" },
  { name: "addarenagroup",aliases: [],               category: "bot", subcat: "admin",      desc: "Add arena group",                             usage: ".addarenagroup" },
  { name: "removearenagroup",aliases: [],            category: "bot", subcat: "admin",      desc: "Remove arena group",                          usage: ".removearenagroup" },
  { name: "arenagroups", aliases: [],                category: "bot", subcat: "admin",      desc: "List arena groups",                           usage: ".arenagroups" },
  { name: "arenagroup-on",aliases: [],               category: "bot", subcat: "admin",      desc: "Enable arena in this group",                  usage: ".arenagroup-on" },
  { name: "arenagroup-off",aliases: [],              category: "bot", subcat: "admin",      desc: "Disable arena in this group",                 usage: ".arenagroup-off" },
  { name: "arena-toggle",aliases: [],                category: "bot", subcat: "admin",      desc: "Toggle arena system",                         usage: ".arena-toggle" },
  { name: "arena-status",aliases: ["owner-arena"],   category: "bot", subcat: "admin",      desc: "Arena control panel",                         usage: ".arena-status" },
  { name: "arena-setlimit",aliases: [],              category: "bot", subcat: "admin",      desc: "Set arena challenge limit",                   usage: ".arena-setlimit 5" },
  { name: "arena-setaura",aliases: [],               category: "bot", subcat: "admin",      desc: "Set arena aura reward",                       usage: ".arena-setaura 10" },
  { name: "arena-resetcounts",aliases: [],           category: "bot", subcat: "admin",      desc: "Reset arena counts",                          usage: ".arena-resetcounts" },
  { name: "arena-crossbonus",aliases: [],            category: "bot", subcat: "admin",      desc: "Set cross-faction arena bonus",               usage: ".arena-crossbonus 5" },
  { name: "arena-clearall",aliases: [],              category: "bot", subcat: "admin",      desc: "Clear all arena data",                        usage: ".arena-clearall" },
  { name: "arena-clearplayer",aliases: [],           category: "bot", subcat: "admin",      desc: "Clear player arena data",                     usage: ".arena-clearplayer @user" },
  { name: "addhuntgroup",aliases: [],                category: "bot", subcat: "admin",      desc: "Add hunting group",                           usage: ".addhuntgroup" },
  { name: "removehuntgroup",aliases: [],             category: "bot", subcat: "admin",      desc: "Remove hunting group",                        usage: ".removehuntgroup" },
  { name: "huntgroups",  aliases: [],                category: "bot", subcat: "admin",      desc: "List hunting groups",                         usage: ".huntgroups" },
  { name: "huntgroup-on",aliases: [],                category: "bot", subcat: "admin",      desc: "Enable hunting in this group",                usage: ".huntgroup-on" },
  { name: "huntgroup-off",aliases: [],               category: "bot", subcat: "admin",      desc: "Disable hunting in this group",               usage: ".huntgroup-off" },
  { name: "addmarketgroup",aliases: [],              category: "bot", subcat: "admin",      desc: "Add market group",                            usage: ".addmarketgroup" },
  { name: "removemarketgroup",aliases: [],           category: "bot", subcat: "admin",      desc: "Remove market group",                         usage: ".removemarketgroup" },
  { name: "marketgroups",aliases: [],                category: "bot", subcat: "admin",      desc: "List market groups",                          usage: ".marketgroups" },
  { name: "marketgroup-on",aliases: [],              category: "bot", subcat: "admin",      desc: "Enable market in this group",                 usage: ".marketgroup-on" },
  { name: "marketgroup-off",aliases: [],             category: "bot", subcat: "admin",      desc: "Disable market in this group",                usage: ".marketgroup-off" },
  { name: "market-add",  aliases: [],                category: "bot", subcat: "admin",      desc: "Add item to market",                          usage: ".market-add item 100" },
  { name: "market-remove",aliases: [],               category: "bot", subcat: "admin",      desc: "Remove item from market",                     usage: ".market-remove item" },
  { name: "market-set",  aliases: [],                category: "bot", subcat: "admin",      desc: "Set market item price",                       usage: ".market-set item 150" },
  { name: "market-items",aliases: [],                category: "bot", subcat: "admin",      desc: "List market items",                           usage: ".market-items" },
  { name: "market-refresh",aliases: [],              category: "bot", subcat: "admin",      desc: "Refresh market stock",                        usage: ".market-refresh" },
  { name: "addmoragroup",aliases: [],                category: "bot", subcat: "admin",      desc: "Add Mora creation lab",                       usage: ".addmoragroup" },
  { name: "removemoragroup",aliases: [],             category: "bot", subcat: "admin",      desc: "Remove Mora creation lab",                    usage: ".removemoragroup" },
  { name: "moragroups",  aliases: [],                category: "bot", subcat: "admin",      desc: "List Mora creation labs",                     usage: ".moragroups" },
  { name: "moracreation-on",aliases: [],             category: "bot", subcat: "admin",      desc: "Enable Mora creation globally",               usage: ".moracreation-on" },
  { name: "moracreation-off",aliases: [],            category: "bot", subcat: "admin",      desc: "Disable Mora creation globally",              usage: ".moracreation-off" },
  { name: "addraidgroup",aliases: ["add-raidgroup"], category: "bot", subcat: "admin",      desc: "Add raid group",                              usage: ".addraidgroup" },
  { name: "removeraidgroup",aliases: ["remove-raidgroup"], category: "bot", subcat: "admin", desc: "Remove raid group",                   usage: ".removeraidgroup" },
  { name: "raids-on",    aliases: [],                category: "bot", subcat: "admin",      desc: "Enable raids globally",                       usage: ".raids-on" },
  { name: "raids-off",   aliases: [],                category: "bot", subcat: "admin",      desc: "Disable raids globally",                      usage: ".raids-off" },
  { name: "raid-end",    aliases: [],                category: "bot", subcat: "admin",      desc: "Force-end active raid",                       usage: ".raid-end" },
  { name: "owner-fac-p", aliases: [],                category: "bot", subcat: "admin",      desc: "Faction control panel",                       usage: ".owner-fac-p" },
  { name: "owner-market",aliases: [],                category: "bot", subcat: "admin",      desc: "Market control panel",                        usage: ".owner-market" },
];

// ─── CATEGORY METADATA ──────────────────────────────────────────

const GAME_CATEGORIES = [
  { id: "core",       emoji: "🌌", name: "Core",          desc: "Profile, stats, gear & character" },
  { id: "mora",       emoji: "🐾", name: "Mora",          desc: "Collection, companions, bonding" },
  { id: "shards",     emoji: "💎", name: "Shards & Styles", desc: "Fighting styles, shards, merge" },
  { id: "combat",     emoji: "⚔️", name: "Combat",        desc: "PvP, arena, faction abilities" },
  { id: "world",      emoji: "🗺️", name: "World",         desc: "Map, hunting, exploration" },
  { id: "factions",   emoji: "🛡️", name: "Factions",      desc: "Missions, wars, sanctuary" },
  { id: "raids",      emoji: "🌀", name: "Raids",         desc: "Kael, cross-faction raids" },
  { id: "economy",    emoji: "💰", name: "Economy",       desc: "Market, bank, trading" },
  { id: "inventory",  emoji: "🎒", name: "Inventory",     desc: "Items, scrolls, consumables" },
  { id: "rankings",   emoji: "🏆", name: "Rankings",      desc: "Leaderboards & wealth" },
  { id: "progression",emoji: "🎯", name: "Progression",   desc: "Quests, achievements, referrals" },
  { id: "pro",        emoji: "⭐", name: "Pro",           desc: "Subscriptions & premium perks" },
  { id: "creation",   emoji: "🧪", name: "Mora Creation", desc: "Forge & approve custom Mora" },
  { id: "bank",       emoji: "🏦", name: "Bank Owner",    desc: "Vault, tax, grants (owner)" },
];

const BOT_CATEGORIES = [
  { id: "media",        emoji: "🎵", name: "Media",        desc: "Stickers, images, quotes" },
  { id: "entertainment",emoji: "🎮", name: "Entertainment",desc: "Fun games, rolls, roasts" },
  { id: "utility",      emoji: "🛠️", name: "Utilities",   desc: "AFK, links, bug reports" },
  { id: "ai",           emoji: "🤖", name: "AI / Prijo",  desc: "Steward AI controls" },
  { id: "info",         emoji: "ℹ️", name: "Info",         desc: "Ping, uptime, status" },
  { id: "admin",        emoji: "🛡️", name: "Admin",       desc: "Moderation & owner controls" },
];

// ─── LOOKUP HELPERS ──────────────────────────────────────────

function getCommandsByCategory(category, subcat) {
  return COMMANDS.filter(c => c.category === category && c.subcat === subcat);
}

function getGameCategories() { return GAME_CATEGORIES; }
function getBotCategories() { return BOT_CATEGORIES; }
function getAllCommands()    { return COMMANDS; }

function findCommand(name) {
  const lower = name.toLowerCase().replace(/^\./, "");
  return COMMANDS.find(c => c.name === lower || c.aliases.includes(lower));
}

/**
 * Validate registry completeness against index.js.
 * Call from CLI: node -e "require('./systems/commandRegistry').validate()"
 */
function validate() {
  const fs = require("fs");
  const src = fs.readFileSync(require("path").join(__dirname, "..", "index.js"), "utf8");
  const regex = /command === "([a-zA-Z0-9_-]+)"/g;
  let m;
  const indexCmds = new Set();
  while ((m = regex.exec(src)) !== null) indexCmds.add(m[1]);

  const regNames = new Set(COMMANDS.map(c => c.name));
  const regAliases = new Set();
  COMMANDS.forEach(c => c.aliases.forEach(a => regAliases.add(a)));

  const missing = [];
  for (const cmd of [...indexCmds].sort()) {
    if (!regNames.has(cmd) && !regAliases.has(cmd)) missing.push(cmd);
  }

  console.log(`Registry: ${COMMANDS.length} commands | index.js: ${indexCmds.size} unique`);
  if (missing.length) {
    console.log(`⚠️  Missing from registry (${missing.length}):`);
    missing.forEach(c => console.log(`  - ${c}`));
  } else {
    console.log("✅ All index.js commands are in the registry.");
  }
  return { total: COMMANDS.length, indexTotal: indexCmds.size, missing };
}

module.exports = {
  COMMANDS,
  GAME_CATEGORIES,
  BOT_CATEGORIES,
  getCommandsByCategory,
  getGameCategories,
  getBotCategories,
  getAllCommands,
  findCommand,
  validate,
};
