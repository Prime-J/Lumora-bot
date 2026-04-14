# Lumora Bot — Owner & New Player Commands

## Owner-Only Commands

### Mora Creation Lab Management
Control which groups can run mora-creation sessions.

| Command | What it does |
|---|---|
| `.moragroups` | Show lab status + allowed groups list + command hints |
| `.addmoragroup` | Add the **current** group to the allowed labs list (run in the group) |
| `.removemoragroup` | Remove the **current** group from the allowed labs list |
| `.moracreation-on` | Enable the Mora Creation Lab system globally |
| `.moracreation-off` | Disable the Mora Creation Lab system globally |

Owners bypass the allowed-list — you can always create mora in any group.

### Giving Rift Energy Orbs (REOB)
Hand out the orb used to craft new mora.

```
.give-orb @player [amount]
.giveorb  @player [amount]      (alias)
```

- Works via **@mention**, **reply**, or **number argument** (`263...`).
- Default amount is `1` if omitted.
- Adds `REOB` directly to the target's inventory.

Example: `.give-orb @star 5` → gives 5 Rift Energy Orbs to star.

---

## New Player Commands (this update)

### Player-to-Player Currency Transfers
```
.transfer-lcr  @player <amount>
.transfer-reob @player <amount>
```
Send Lumoran Crystal (LCR) or Rift Energy Orbs to another registered player. Works by @mention or reply.

### Cleanse Shard — Now Targets Party Mora
```
.use cleanse shard <party-slot | mora-name>
```
Examples:
- `.use cleanse shard 2` → cleanses corruption on the mora in party slot 2.
- `.use cleanse shard sparko` → cleanses the first **Sparko** in your party.
Fails gracefully if the target isn't in your party or isn't corrupted.

### Search Your Tamed Mora
```
.tamed-search <name>
```
Lists every mora you own matching the name, with their IDs, level, and PE — useful when you have multiple Sparkos etc.

### Faction Sanctuary View
```
.view-sanctuary
```
Shows, for **your faction**:
- Total mora deployed by all members
- Faction wealth (LCR pooled in the sanctuary)
- Faction points
- Top contributors

---

## Notes
- Items are transferred via `.gitem` (existing), currencies via the new `.transfer-*` commands above.
- REOB auto-shows in `.inventory` under **Consumables** once granted.
- Hunt intelligence gathering is per-faction: `.gather` / `.intel` (Harmony `Release`, Purity `Analyze`, Rift `Probe`, None `Observe`).
